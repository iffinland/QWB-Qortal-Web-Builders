/**
 * The publish + verify pipeline.
 *
 * The contract facts these tests pin (Core `108bf191`, Hub `12a573b2`):
 *
 *  - every request carries `name` explicitly (omitting it makes the Hub publish
 *    under the user's last-used name);
 *  - a resolved publish is a **submission**; only a read-back that returns the
 *    expected revision may be reported as verified;
 *  - a declined, timed-out or unclear outcome is never retried automatically;
 *  - the entity payload must fit the node's JSON service limit, and an oversize
 *    draft is refused *before* anything reaches the host;
 *  - there is no delete: the tombstone is a republish of the same coordinate.
 */

import { describe, expect, it } from 'vitest';

import { bytesToBase64 } from '../src/qortal/base64';
import { createBridge } from '../src/qortal/bridge';
import type { QortalRequest } from '../src/qortal/bridge';
import {
  ENTITY_FILENAME,
  IMAGE_MAX_BYTES,
  MEDIA_BYTE_COMPARE_LIMIT,
  THUMBNAIL_MAX_BYTES,
  buildEntityPublishRequest,
  buildMediaPublishRequest,
  checkEntityStatus,
  planMediaService,
  publishEntity,
  publishMedia,
} from '../src/qortal/publish';
import { classifyPublishOutcome, verifyServedRevision } from '../src/qortal/write';
import type { ArticleEntity, HighlightEntity } from '../src/content/schema';
import { buildTombstone } from '../src/content/schema';
import { createSeedSource } from '../src/content/repository';
import type { ContentBundle } from '../src/content/schema';
import { base64ToText, createFakeNode, seedStoredEntities } from './support/qdn';

const OWNER_NAME = 'Qortal Web Builders';

async function seedBundle(): Promise<ContentBundle> {
  const loaded = await createSeedSource().load();
  if (loaded.status === 'error') throw new Error('the shipped seed content is invalid');
  return loaded.bundle;
}

async function firstHighlight(): Promise<HighlightEntity> {
  const highlight = (await seedBundle()).highlights[0];
  if (highlight === undefined) throw new Error('no seed highlight');
  return highlight;
}

function context(bridge: ReturnType<typeof createBridge>, overrides: Record<string, unknown> = {}) {
  return { bridge, name: OWNER_NAME, verifyAttempts: 1, verifyDelayMs: 0, ...overrides };
}

describe('entity publish request', () => {
  it('builds a JSON request that carries the publishing name and the parsed entity', async () => {
    const entity = await firstHighlight();
    const built = buildEntityPublishRequest(entity, OWNER_NAME);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(built.request.service).toBe('JSON');
    expect(built.request.name).toBe(OWNER_NAME);
    expect(built.request.identifier).toBe(entity.id);
    expect(built.request.fileName).toBe(ENTITY_FILENAME);
    expect(JSON.parse(base64ToText(built.request.data64))).toEqual(entity);
    expect(built.request.title).toBe(entity.title);
    expect(built.request.description).toContain(entity.id);
    expect(built.request.byteLength).toBe(new TextEncoder().encode(JSON.stringify(entity)).length);
  });

  it('refuses a draft with no publishing identity', async () => {
    const built = buildEntityPublishRequest(await firstHighlight(), '   ');
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.reason).toContain('publishing identity');
  });

  it('refuses an identifier that does not belong to the entity kind', async () => {
    const entity = await firstHighlight();
    const built = buildEntityPublishRequest({ ...entity, id: 'qwb_work_mismatch' }, OWNER_NAME);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.reason).toContain('does not carry the highlight');
  });

  it('refuses an oversize payload before it can reach the host', async () => {
    const entity = await firstHighlight();
    const fat: HighlightEntity = {
      ...entity,
      payload: { ...entity.payload, bullets: Array.from({ length: 400 }, () => 'x'.repeat(100)) },
    };
    const built = buildEntityPublishRequest(fat, OWNER_NAME);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.reason).toContain('above the');
    expect(built.reason).toContain('JSON service');
  });

  it('publishes a tombstone as the same coordinate with state deleted', async () => {
    const entity = await firstHighlight();
    const tombstone = buildTombstone(entity, 1_700_000_123_000);
    expect(tombstone.id).toBe(entity.id);
    expect(tombstone.rev).toBe(entity.rev + 1);

    const built = buildEntityPublishRequest(tombstone, OWNER_NAME);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.identifier).toBe(entity.id);
    expect(JSON.parse(base64ToText(built.request.data64))).toEqual(tombstone);
  });
});

describe('media publish request', () => {
  it('chooses the service from the payload size', () => {
    expect(planMediaService(0)).toBeNull();
    expect(planMediaService(1024)).toBe('THUMBNAIL');
    expect(planMediaService(THUMBNAIL_MAX_BYTES)).toBe('THUMBNAIL');
    expect(planMediaService(THUMBNAIL_MAX_BYTES + 1)).toBe('IMAGE');
    expect(planMediaService(IMAGE_MAX_BYTES)).toBe('IMAGE');
    expect(planMediaService(IMAGE_MAX_BYTES + 1)).toBeNull();
  });

  it('refuses an unsupported image type and an empty file', () => {
    const base = { identifier: 'qwb_work_x', title: 't', filename: 'c.gif' };
    expect(
      buildMediaPublishRequest(
        { ...base, bytes: new Uint8Array([1]), mimeType: 'image/gif' },
        OWNER_NAME,
      ).ok,
    ).toBe(false);
    const empty = buildMediaPublishRequest(
      { ...base, bytes: new Uint8Array([]), mimeType: 'image/webp' },
      OWNER_NAME,
    );
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.reason).toContain('empty');
  });

  it('base64-encodes the exact bytes and labels the media with the entity identifier', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const built = buildMediaPublishRequest(
      {
        identifier: 'qwb_work_x',
        bytes,
        mimeType: 'image/webp',
        filename: 'cover.webp',
        title: 'Cover',
      },
      OWNER_NAME,
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.service).toBe('THUMBNAIL');
    expect(built.request.name).toBe(OWNER_NAME);
    expect(built.request.identifier).toBe('qwb_work_x');
    expect(built.request.byteLength).toBe(bytes.length);
    const decoded = atob(built.request.data64);
    expect(Array.from(decoded, (character) => character.charCodeAt(0))).toEqual(Array.from(bytes));
  });
});

describe('write classification', () => {
  const expected = { service: 'JSON', name: OWNER_NAME, identifier: 'qwb_hl_x' };

  it('treats a resolved publish without a signature as ambiguous, not as submitted', () => {
    const classification = classifyPublishOutcome({ ok: true, value: {} }, expected);
    expect(classification.state).toBe('ambiguous');
    expect(classification.submission).toBeNull();
  });

  it('separates submitted, rejected, ambiguous and failed outcomes', () => {
    expect(classifyPublishOutcome({ ok: true, value: { signature: 's' } }, expected).state).toBe(
      'submitted',
    );
    expect(
      classifyPublishOutcome(
        {
          ok: false,
          error: {
            kind: 'host-rejected',
            action: 'PUBLISH_QDN_RESOURCE',
            message: 'declined',
            hostMediated: true,
          },
        },
        expected,
      ).state,
    ).toBe('rejected');
    expect(
      classifyPublishOutcome(
        {
          ok: false,
          error: {
            kind: 'timeout',
            action: 'PUBLISH_QDN_RESOURCE',
            message: 'timed out',
            hostMediated: true,
          },
        },
        expected,
      ).state,
    ).toBe('ambiguous');
    expect(
      classifyPublishOutcome(
        {
          ok: false,
          error: {
            kind: 'transport-error',
            action: 'PUBLISH_QDN_RESOURCE',
            message: 'boom',
            hostMediated: true,
          },
        },
        expected,
      ).state,
    ).toBe('failed');
  });

  it('only promotes an exact served revision to verified', () => {
    expect(verifyServedRevision(2, null)).toBe('not-yet-served');
    expect(verifyServedRevision(2, 1)).toBe('not-yet-served');
    expect(verifyServedRevision(2, 2)).toBe('verified');
    expect(verifyServedRevision(2, 3)).toBe('superseded');
  });
});

describe('publishEntity', () => {
  it('claims verified only after reading the new revision back', async () => {
    const entity = await firstHighlight();
    const node = createFakeNode({ name: OWNER_NAME, entities: await seedStoredEntities() });
    const result = await publishEntity(context(node.bridge), {
      ...entity,
      rev: entity.rev + 1,
      title: 'New',
    });

    expect(result.state).toBe('submitted');
    expect(result.availability).toBe('verified');
    expect(result.verified).toBe(true);
    expect(result.servedRev).toBe(entity.rev + 1);
    expect(result.signature).toBe('signature-1');
    expect(result.detail).toContain('Published and verified');
    expect(node.publishes()).toHaveLength(1);
    expect(node.publishes()[0]?.name).toBe(OWNER_NAME);
    expect(node.publishes()[0]?.identifier).toBe(entity.id);
  });

  it('does not claim success when the node still serves the old revision', async () => {
    const entity = await firstHighlight();
    const node = createFakeNode({
      name: OWNER_NAME,
      entities: await seedStoredEntities(),
      autoStore: false,
    });
    const result = await publishEntity(context(node.bridge, { verifyAttempts: 3 }), {
      ...entity,
      rev: entity.rev + 1,
    });

    expect(result.state).toBe('submitted');
    expect(result.availability).toBe('not-yet-served');
    expect(result.verified).toBe(false);
    expect(result.detail).toContain('not verified yet');
    expect(result.detail).toContain('Nothing is retried automatically');
    // Exactly one signed submission; the retries were read-only.
    expect(node.publishes()).toHaveLength(1);
  });

  it('bounds the read-back retries', async () => {
    const entity = await firstHighlight();
    const node = createFakeNode({
      name: OWNER_NAME,
      entities: await seedStoredEntities(),
      autoStore: false,
    });
    await publishEntity(context(node.bridge, { verifyAttempts: 4 }), {
      ...entity,
      rev: entity.rev + 1,
    });

    const reads = node
      .calls()
      .filter((call) => call.action === 'FETCH_QDN_RESOURCE' && call.identifier === entity.id);
    expect(reads).toHaveLength(4);
    expect(node.publishes()).toHaveLength(1);
  });

  it('reports a competing newer revision as superseded instead of overwriting it', async () => {
    const entity = await firstHighlight();
    const node = createFakeNode({
      name: OWNER_NAME,
      entities: [
        { ...entity, rev: 9, title: 'Someone newer' },
        ...(await seedStoredEntities()).filter((stored) => stored.id !== entity.id),
      ],
      autoStore: false,
    });
    const result = await publishEntity(context(node.bridge), { ...entity, rev: entity.rev + 1 });

    expect(result.availability).toBe('superseded');
    expect(result.servedRev).toBe(9);
    expect(result.detail).toContain('newer than the submitted');
    expect(result.verified).toBe(false);
  });

  it('never retries a rejected or ambiguous submission', async () => {
    const entity = await firstHighlight();
    for (const [error, state] of [
      [new Error('user declined request'), 'rejected'],
      [new Error('The request timed out'), 'ambiguous'],
    ] as const) {
      const node = createFakeNode({ name: OWNER_NAME, publishError: error });
      const result = await publishEntity(context(node.bridge), { ...entity, rev: entity.rev + 1 });
      expect(result.state).toBe(state);
      expect(result.availability).toBe('unverified');
      expect(result.verified).toBe(false);
      expect(node.publishes()).toHaveLength(1);
    }
  });

  it('refuses an oversize draft without contacting the host', async () => {
    const entity = await firstHighlight();
    const node = createFakeNode({ name: OWNER_NAME });
    const fat: HighlightEntity = {
      ...entity,
      payload: { ...entity.payload, bullets: Array.from({ length: 400 }, () => 'x'.repeat(100)) },
    };
    const result = await publishEntity(context(node.bridge), fat);

    expect(result.state).toBe('failed');
    expect(result.detail).toContain('Nothing was published');
    expect(node.calls()).toHaveLength(0);
  });

  it('reads back a single time for the explicit status check', async () => {
    const entity = await firstHighlight();
    const node = createFakeNode({ name: OWNER_NAME, entities: await seedStoredEntities() });
    const served = await checkEntityStatus(context(node.bridge), {
      id: entity.id,
      rev: entity.rev,
    });

    expect(served.availability).toBe('verified');
    expect(node.calls().filter((call) => call.action === 'FETCH_QDN_RESOURCE')).toHaveLength(1);
    expect(node.publishes()).toHaveLength(0);
  });
});

describe('publishMedia', () => {
  it('returns a verified reference only after the bytes are read back', async () => {
    const node = createFakeNode({ name: OWNER_NAME });
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const written = await publishMedia(context(node.bridge), {
      identifier: 'qwb_work_media',
      bytes,
      mimeType: 'image/webp',
      filename: 'cover.webp',
      title: 'Cover',
    });

    expect(written.result.availability).toBe('verified');
    expect(written.ref).toEqual({
      source: 'qdn',
      service: 'THUMBNAIL',
      name: OWNER_NAME,
      identifier: 'qwb_work_media',
      filename: 'cover.webp',
      alt: 'Cover',
    });
    expect(node.publishes()[0]?.service).toBe('THUMBNAIL');
  });

  it('withholds the reference when the image is not served yet', async () => {
    const node = createFakeNode({ name: OWNER_NAME, autoStore: false });
    const written = await publishMedia(context(node.bridge), {
      identifier: 'qwb_work_media',
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/webp',
      filename: 'cover.webp',
      title: 'Cover',
    });

    expect(written.result.availability).toBe('not-yet-served');
    expect(written.ref).toBeNull();
    expect(node.publishes()).toHaveLength(1);
  });

  it('refuses an image above the QDN image limit before publishing anything', async () => {
    const node = createFakeNode({ name: OWNER_NAME });
    const written = await publishMedia(context(node.bridge), {
      identifier: 'qwb_work_media',
      bytes: new Uint8Array(IMAGE_MAX_BYTES + 1),
      mimeType: 'image/webp',
      filename: 'cover.webp',
      title: 'Cover',
    });

    expect(written.result.state).toBe('failed');
    expect(written.ref).toBeNull();
    expect(node.calls()).toHaveLength(0);
  });

  it('still compares bytes when the payload is under the limit and its base64 is over it', async () => {
    // `MEDIA_BYTE_COMPARE_LIMIT` is a *byte* bound: base64 is a third longer, so
    // comparing the encoded string against it would skip the byte check for
    // payloads that are well within it.
    const bytes = new Uint8Array(MEDIA_BYTE_COMPARE_LIMIT);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
    const served = bytesToBase64(bytes);
    expect(served.length).toBeGreaterThan(MEDIA_BYTE_COMPARE_LIMIT);

    const calls: QortalRequest[] = [];
    const bridge = createBridge({
      qortalRequest: (request: QortalRequest): Promise<unknown> => {
        calls.push(request);
        if (request.action === 'PUBLISH_QDN_RESOURCE') return Promise.resolve({ signature: 'sig' });
        if (request.action === 'FETCH_QDN_RESOURCE') return Promise.resolve(served);
        return Promise.reject(new Error(`unexpected ${String(request.action)}`));
      },
    });

    const written = await publishMedia(context(bridge), {
      identifier: 'qwb_work_big',
      bytes,
      mimeType: 'image/webp',
      filename: 'cover.webp',
      title: 'Cover',
    });

    expect(written.result.availability).toBe('verified');
    expect(written.result.detail).toContain('exact bytes');
    expect(
      calls.some((call) => call.action === 'FETCH_QDN_RESOURCE' && call.encoding === 'base64'),
    ).toBe(true);
    expect(calls.some((call) => call.action === 'GET_QDN_RESOURCE_STATUS')).toBe(false);
  });

  it('does not treat re-encoded whitespace as different bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
    const canonical = bytesToBase64(bytes);
    const bridge = createBridge({
      qortalRequest: (request: QortalRequest): Promise<unknown> => {
        if (request.action === 'PUBLISH_QDN_RESOURCE') return Promise.resolve({ signature: 'sig' });
        // A node that answers with folded lines and no padding still serves the same bytes.
        return Promise.resolve(`  ${canonical.replace(/=+$/, '')}\n`);
      },
    });

    const written = await publishMedia(context(bridge), {
      identifier: 'qwb_work_media',
      bytes,
      mimeType: 'image/webp',
      filename: 'cover.webp',
      title: 'Cover',
    });

    expect(written.result.availability).toBe('verified');
    expect(written.ref).not.toBeNull();
  });

  it('reports genuinely different bytes as not-yet-served', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
    const bridge = createBridge({
      qortalRequest: (request: QortalRequest): Promise<unknown> => {
        if (request.action === 'PUBLISH_QDN_RESOURCE') return Promise.resolve({ signature: 'sig' });
        return Promise.resolve(bytesToBase64(new Uint8Array([9, 9, 9, 9, 9, 9, 9])));
      },
    });

    const written = await publishMedia(context(bridge), {
      identifier: 'qwb_work_media',
      bytes,
      mimeType: 'image/webp',
      filename: 'cover.webp',
      title: 'Cover',
    });

    expect(written.result.availability).toBe('not-yet-served');
    expect(written.result.detail).toContain('different bytes');
    expect(written.ref).toBeNull();
  });

  it('falls back to a status check for images too large to compare byte for byte', async () => {
    // A node that reports READY but is asked for a resource above the compare limit.
    const calls: QortalRequest[] = [];
    const bridge = createBridge({
      qortalRequest: (request: QortalRequest): Promise<unknown> => {
        calls.push(request);
        if (request.action === 'PUBLISH_QDN_RESOURCE') return Promise.resolve({ signature: 'sig' });
        if (request.action === 'GET_QDN_RESOURCE_STATUS')
          return Promise.resolve({ status: 'READY' });
        return Promise.reject(new Error(`unexpected ${String(request.action)}`));
      },
    });

    const bytes = new Uint8Array(MEDIA_BYTE_COMPARE_LIMIT + 1);
    const written = await publishMedia(context(bridge), {
      identifier: 'qwb_work_big',
      bytes,
      mimeType: 'image/webp',
      filename: 'cover.webp',
      title: 'Cover',
    });

    expect(written.result.availability).toBe('verified');
    // The wording must not imply the bytes were compared when they were not.
    expect(written.result.detail).toContain('byte identity was not compared for this size');
    expect(calls.some((call) => call.action === 'GET_QDN_RESOURCE_STATUS')).toBe(true);
    expect(
      calls.some((call) => call.action === 'FETCH_QDN_RESOURCE' && call.encoding === 'base64'),
    ).toBe(false);
  });
});

describe('article entities remain publishable', () => {
  it('sends a full article payload unchanged', async () => {
    const bundle = await seedBundle();
    const article: ArticleEntity | undefined = bundle.articles[0];
    if (article === undefined) throw new Error('no seed article');
    const built = buildEntityPublishRequest(article, OWNER_NAME);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(JSON.parse(base64ToText(built.request.data64))).toEqual(article);
  });
});
