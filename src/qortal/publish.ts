/**
 * The QDN publish/verify pipeline.
 *
 * Contract facts this module rests on (Core `108bf191`, Hub `12a573b2`):
 *
 *  - Entity payloads go to the service the approved model assigns to their kind
 *    (`JSON` for everything but articles, `DOCUMENT` for articles — audit §6.1).
 *    The service is derived from the identifier prefix on both sides, so a
 *    read-back can never look in a different service than the write used.
 *  - `PUBLISH_QDN_RESOURCE` needs `service` plus one of `file`/`data64`/`base64`.
 *    This app only ever publishes `data64` (base64 of the bytes) plus a
 *    `filename`, so the produced URL and the served MIME type are predictable.
 *  - The host publishes under `data.name` when it is supplied. **Omitting it makes
 *    the Hub fall back to the user's last-used name**, which would silently
 *    publish content under a different identity than the app that owns it. Every
 *    request here carries `name` = the app's injected `_qdnName`.
 *  - A resolved publish means "the host signed and relayed a submission". It is
 *    **not** proof that the node serves the new revision, so nothing is reported
 *    as published until the entity has been read back and its `rev` compared.
 *  - A declined/timed-out approval is never retried automatically: the same
 *    transaction may already be on its way.
 *  - There is no QDN delete. A delete is a tombstone republish of the same
 *    `(name, service, identifier)`; the previous bytes stay retrievable.
 *
 * The read-back is a public, idempotent read, so it *is* retried in a bounded way
 * while the node catches up; only the signed write is single-shot.
 */

import type { ImageRef, TombstoneEntity } from '../content/schema';
import type { AnyEntity } from '../content/schema';
import {
  identifierPrefixFor,
  isValidIdentifier,
  readStoredEntity,
  serviceForIdentifier,
  serviceForKind,
} from '../content/schema';
import { base64ByteLength, bytesToBase64, normalizeBase64, textToBase64 } from './base64';
import type { QortalBridge } from './bridge';
import { fetchBase64Resource, fetchJsonResource, fetchResourceStatus } from './read';
import type { WriteAvailability, WriteState } from './write';
import { classifyPublishOutcome, verifyServedRevision } from './write';

/**
 * Core `Service.JSON` maximum payload (the node validates that it parses).
 * Applies to every kind the approved model publishes in `JSON` and to the site
 * singleton.
 */
export const ENTITY_MAX_BYTES = 25 * 1024;
/**
 * App-level bound for `DOCUMENT` entity payloads.
 *
 * `Service.DOCUMENT` has no node-side limit, but an entity's payload is fetched by
 * *every* visitor read of its kind, so an unbounded article would be a permanent
 * page-load cost and an unbounded publish fee. 200 KB is ~80× the largest shipped
 * article; the refusal is reported truthfully instead of publishing something the
 * site cannot serve well.
 */
export const DOCUMENT_MAX_BYTES = 200 * 1024;

/** `DOCUMENT` payloads are still JSON text; the shim parses them on read. */
export const ENTITY_FILENAME = 'qwb.json';
/** Core `Service.THUMBNAIL` / `Service.IMAGE` limits. */
export const THUMBNAIL_MAX_BYTES = 500 * 1024;
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** Core metadata caps (`MAX_TITLE_LENGTH` / `MAX_DESCRIPTION_LENGTH`). */
const METADATA_TITLE_MAX = 80;
const METADATA_DESCRIPTION_MAX = 240;

/**
 * Above this many **decoded bytes**, media verification checks node availability
 * instead of exact bytes (holding a multi-megabyte base64 string in the frame to
 * compare it is the cost this bound avoids). It is a byte count, not a base64
 * character count — the encoded string is a third larger than the payload.
 */
export const MEDIA_BYTE_COMPARE_LIMIT = 1_400_000;

/** Bounded read-back while the node catches up (public, idempotent read). */
export const VERIFY_ATTEMPTS = 4;
export const VERIFY_DELAY_MS = 5000;

export type PublishableEntity = AnyEntity | TombstoneEntity;

export interface PublishContext {
  readonly bridge: QortalBridge;
  /** The publishing identity: `_qdnName` from the served WEBSITE resource. */
  readonly name: string;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly verifyAttempts?: number;
  readonly verifyDelayMs?: number;
}

export interface BuiltRequest {
  readonly service: string;
  readonly name: string;
  readonly identifier: string;
  readonly fileName: string;
  readonly data64: string;
  readonly title: string;
  readonly description: string;
  readonly byteLength: number;
}

export type RequestBuild =
  | { readonly ok: true; readonly request: BuiltRequest }
  | { readonly ok: false; readonly reason: string };

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Builds the `PUBLISH_QDN_RESOURCE` request for one entity, or explains why not. */
export function buildEntityPublishRequest(entity: PublishableEntity, name: string): RequestBuild {
  if (name.trim() === '') {
    return { ok: false, reason: 'the app has no publishing identity (_qdnName is empty)' };
  }
  if (!isValidIdentifier(entity.id)) {
    return { ok: false, reason: `"${entity.id}" is not a valid QDN identifier` };
  }
  if (!entity.id.startsWith(identifierPrefixFor(entity.kind))) {
    return {
      ok: false,
      reason: `"${entity.id}" does not carry the ${entity.kind} identifier prefix`,
    };
  }

  const service = serviceForKind(entity.kind);
  const json = JSON.stringify(entity);
  const byteLength = utf8Length(json);
  const limit = service === 'JSON' ? ENTITY_MAX_BYTES : DOCUMENT_MAX_BYTES;
  if (byteLength > limit) {
    return {
      ok: false,
      reason:
        service === 'JSON'
          ? `the entity payload is ${String(byteLength)} bytes, above the ${String(ENTITY_MAX_BYTES)}-byte limit of the QDN JSON service`
          : `the entity payload is ${String(byteLength)} bytes, above this app's ${String(DOCUMENT_MAX_BYTES)}-byte bound for articles (the QDN DOCUMENT service sets no limit of its own)`,
    };
  }

  return {
    ok: true,
    request: {
      service,
      name,
      identifier: entity.id,
      fileName: ENTITY_FILENAME,
      data64: textToBase64(json),
      title: truncate(entity.title, METADATA_TITLE_MAX),
      description: truncate(
        `QWB ${entity.kind} ${entity.id} · schema ${String(entity.schema)} · rev ${String(entity.rev)}`,
        METADATA_DESCRIPTION_MAX,
      ),
      byteLength,
    },
  };
}

const MEDIA_MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** The service a media payload belongs in, from its own byte length. */
export function planMediaService(byteLength: number): 'THUMBNAIL' | 'IMAGE' | null {
  if (byteLength === 0) return null;
  if (byteLength <= THUMBNAIL_MAX_BYTES) return 'THUMBNAIL';
  if (byteLength <= IMAGE_MAX_BYTES) return 'IMAGE';
  return null;
}

export interface MediaRequest {
  /** The owning entity's identifier (audit §6.1: media shares it). */
  readonly identifier: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly filename: string;
  readonly title: string;
}

export interface BuiltMediaRequest extends BuiltRequest {
  readonly service: 'THUMBNAIL' | 'IMAGE';
}

export type MediaRequestBuild =
  | { readonly ok: true; readonly request: BuiltMediaRequest }
  | { readonly ok: false; readonly reason: string };

export function buildMediaPublishRequest(request: MediaRequest, name: string): MediaRequestBuild {
  if (name.trim() === '') {
    return { ok: false, reason: 'the app has no publishing identity (_qdnName is empty)' };
  }
  if (!isValidIdentifier(request.identifier)) {
    return { ok: false, reason: `"${request.identifier}" is not a valid QDN identifier` };
  }
  if (!Object.hasOwn(MEDIA_MIME_EXTENSIONS, request.mimeType)) {
    return {
      ok: false,
      reason: `images must be WebP, JPEG or PNG (received ${request.mimeType})`,
    };
  }

  const service = planMediaService(request.bytes.length);
  if (service === null) {
    return {
      ok: false,
      reason:
        request.bytes.length === 0
          ? 'the chosen image is empty'
          : `the encoded image is ${String(request.bytes.length)} bytes, above the ${String(IMAGE_MAX_BYTES)}-byte QDN image limit`,
    };
  }

  return {
    ok: true,
    request: {
      service,
      name,
      identifier: request.identifier,
      fileName: request.filename,
      data64: bytesToBase64(request.bytes),
      title: truncate(request.title, METADATA_TITLE_MAX),
      description: truncate(`QWB media for ${request.identifier}`, METADATA_DESCRIPTION_MAX),
      byteLength: request.bytes.length,
    },
  };
}

export interface WriteResult {
  /** What the host did with the request. */
  readonly state: WriteState;
  /** What the read-back proved. */
  readonly availability: WriteAvailability;
  /** One truthful sentence for the UI. */
  readonly detail: string;
  readonly expectedRev: number | null;
  readonly servedRev: number | null;
  readonly signature: string | null;
  readonly verified: boolean;
}

export interface ServedRevision {
  readonly availability: WriteAvailability;
  readonly servedRev: number | null;
  readonly detail: string;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function attemptsOf(context: PublishContext): number {
  const attempts = Math.floor(context.verifyAttempts ?? VERIFY_ATTEMPTS);
  return Number.isFinite(attempts) && attempts > 0 ? attempts : 1;
}

function delayOf(context: PublishContext): number {
  const delay = context.verifyDelayMs ?? VERIFY_DELAY_MS;
  return Number.isFinite(delay) && delay > 0 ? delay : 0;
}

/**
 * Re-reads one entity and compares its served revision with `expectedRev`.
 *
 * Terminal outcomes are returned immediately: an exact match is `verified`, and a
 * *higher* served revision is `superseded` (another write won — waiting cannot
 * change that). A missing/lagging read is retried a bounded number of times.
 */
export async function verifyServedEntity(
  context: PublishContext,
  expected: { readonly id: string; readonly rev: number },
): Promise<ServedRevision> {
  const attempts = attemptsOf(context);
  const delay = delayOf(context);
  const sleep = context.sleep ?? defaultSleep;
  let last: ServedRevision = {
    availability: 'not-yet-served',
    servedRev: null,
    detail: 'the resource has not been read back yet',
  };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const read = await fetchJsonResource(context.bridge, {
      // Derived from the identifier prefix, which is the kind, so a read-back
      // always addresses the coordinate the write produced.
      service: serviceForIdentifier(expected.id),
      name: context.name,
      identifier: expected.id,
    });

    if (read.ok) {
      const stored = readStoredEntity(read.value, expected.id);
      if (stored.status === 'invalid') {
        return {
          availability: 'not-yet-served',
          servedRev: null,
          detail: `the served payload is not a valid QWB entity (${stored.errors.join('; ')})`,
        };
      }
      const servedRev = stored.status === 'active' ? stored.entity.rev : stored.tombstone.rev;
      const availability = verifyServedRevision(expected.rev, servedRev);
      last = {
        availability,
        servedRev,
        detail:
          availability === 'verified'
            ? `the node serves revision ${String(servedRev)}`
            : availability === 'superseded'
              ? `the node serves revision ${String(servedRev)}, which is newer than the submitted ${String(expected.rev)}`
              : `the node still serves revision ${String(servedRev)}; the submitted revision ${String(expected.rev)} is not visible on this node yet`,
      };
      if (availability === 'verified' || availability === 'superseded') return last;
    } else {
      last = {
        availability: 'not-yet-served',
        servedRev: null,
        detail: `the entity could not be read back: ${read.error.message}`,
      };
    }

    if (attempt < attempts) await sleep(delay);
  }

  return last;
}

/** Re-reads one media resource; byte identity when it is small enough to compare. */
export async function verifyServedMedia(
  context: PublishContext,
  expected: { readonly service: string; readonly id: string; readonly data64: string },
): Promise<ServedRevision> {
  const ref = { service: expected.service, name: context.name, identifier: expected.id };

  if (base64ByteLength(expected.data64) <= MEDIA_BYTE_COMPARE_LIMIT) {
    const read = await fetchBase64Resource(context.bridge, ref);
    if (!read.ok) {
      return {
        availability: 'not-yet-served',
        servedRev: null,
        detail: `the image could not be read back: ${read.error.message}`,
      };
    }
    if (normalizeBase64(read.value) === normalizeBase64(expected.data64)) {
      return {
        availability: 'verified',
        servedRev: null,
        detail: 'the node serves the exact bytes that were submitted',
      };
    }
    return {
      availability: 'not-yet-served',
      servedRev: null,
      detail: 'the node serves different bytes than the ones that were submitted',
    };
  }

  const status = await fetchResourceStatus(context.bridge, ref);
  if (!status.ok) {
    return {
      availability: 'not-yet-served',
      servedRev: null,
      detail: `the image status could not be read: ${status.error.message}`,
    };
  }
  if (status.value === 'READY') {
    return {
      availability: 'verified',
      servedRev: null,
      detail: 'the node reports the image as READY (byte identity was not compared for this size)',
    };
  }
  return {
    availability: 'not-yet-served',
    servedRev: null,
    detail: `the node reports the image as ${status.value}, so it is not served yet`,
  };
}

/**
 * Composes the one sentence the owner sees after a signed submission, from the
 * read-back result. It is never optimistic: only `verified` claims the change is
 * live, and even then the sentence is the read-back's own wording — so an image
 * verified by a status check says that byte identity was not compared instead of
 * implying it was.
 */
function describeSubmitted(
  availability: WriteAvailability,
  served: ServedRevision,
  signature: string | null,
): string {
  const signatureNote = signature === null ? '' : ` (signature ${signature.slice(0, 12)}…)`;
  switch (availability) {
    case 'verified':
      return `Published and verified${signatureNote}: ${served.detail}.`;
    case 'superseded':
      return `Submitted${signatureNote}, but ${served.detail}. The submitted change is not the newest revision — review the content before publishing again.`;
    case 'unverified':
    case 'not-yet-served':
      return `Submitted to the host${signatureNote}, but not verified yet: ${served.detail}. Nothing is retried automatically — use “Check status”.`;
  }
}

function resultFrom(
  state: WriteState,
  availability: WriteAvailability,
  detail: string,
  options: {
    readonly expectedRev: number | null;
    readonly servedRev: number | null;
    readonly signature: string | null;
  },
): WriteResult {
  return {
    state,
    availability,
    detail,
    expectedRev: options.expectedRev,
    servedRev: options.servedRev,
    signature: options.signature,
    verified: availability === 'verified',
  };
}

/** Publishes one entity (or tombstone) and verifies the served revision. */
export async function publishEntity(
  context: PublishContext,
  entity: PublishableEntity,
): Promise<WriteResult> {
  const built = buildEntityPublishRequest(entity, context.name);
  if (!built.ok) {
    return resultFrom('failed', 'unverified', `Nothing was published: ${built.reason}.`, {
      expectedRev: entity.rev,
      servedRev: null,
      signature: null,
    });
  }

  const outcome = await context.bridge.request<unknown>(
    'PUBLISH_QDN_RESOURCE',
    { ...built.request },
    { timeoutMs: 60 * 60 * 1000 },
  );

  const classification = classifyPublishOutcome(outcome, {
    service: built.request.service,
    name: built.request.name,
    identifier: built.request.identifier,
  });
  const signature = classification.submission?.signature ?? null;

  if (classification.state !== 'submitted') {
    return resultFrom(classification.state, 'unverified', classification.detail, {
      expectedRev: entity.rev,
      servedRev: null,
      signature,
    });
  }

  const served = await verifyServedEntity(context, { id: entity.id, rev: entity.rev });
  return resultFrom(
    'submitted',
    served.availability,
    describeSubmitted(served.availability, served, signature),
    { expectedRev: entity.rev, servedRev: served.servedRev, signature },
  );
}

export interface MediaWriteResult {
  readonly result: WriteResult;
  /** Present once the media submission is verified (the entity may reference it). */
  readonly ref: ImageRef | null;
}

/**
 * Publishes one image and verifies it. The returned `ref` is only populated when
 * verification succeeded, because the entity that references it must not be
 * published while the image is unproven (audit §6.3: media before entity).
 */
export async function publishMedia(
  context: PublishContext,
  request: MediaRequest,
): Promise<MediaWriteResult> {
  const built = buildMediaPublishRequest(request, context.name);
  if (!built.ok) {
    return {
      result: resultFrom('failed', 'unverified', `Nothing was published: ${built.reason}.`, {
        expectedRev: null,
        servedRev: null,
        signature: null,
      }),
      ref: null,
    };
  }

  const service = built.request.service;
  const outcome = await context.bridge.request<unknown>(
    'PUBLISH_QDN_RESOURCE',
    { ...built.request },
    { timeoutMs: 60 * 60 * 1000 },
  );

  const classification = classifyPublishOutcome(outcome, {
    service,
    name: built.request.name,
    identifier: built.request.identifier,
  });
  const signature = classification.submission?.signature ?? null;

  if (classification.state !== 'submitted') {
    return {
      result: resultFrom(classification.state, 'unverified', classification.detail, {
        expectedRev: null,
        servedRev: null,
        signature,
      }),
      ref: null,
    };
  }

  const served = await verifyServedMedia(context, {
    service,
    id: request.identifier,
    data64: built.request.data64,
  });

  const ref: ImageRef | null =
    served.availability === 'verified'
      ? {
          source: 'qdn',
          service,
          name: context.name,
          identifier: request.identifier,
          filename: request.filename,
          alt: request.title,
        }
      : null;

  return {
    result: resultFrom(
      'submitted',
      served.availability,
      describeSubmitted(served.availability, served, signature),
      { expectedRev: null, servedRev: null, signature },
    ),
    ref,
  };
}

/** The one-shot status re-check used by the owner's “Check status” action. */
export async function checkEntityStatus(
  context: PublishContext,
  expected: { readonly id: string; readonly rev: number },
  options: { readonly attempts?: number } = {},
): Promise<ServedRevision> {
  return verifyServedEntity({ ...context, verifyAttempts: options.attempts ?? 1 }, expected);
}
