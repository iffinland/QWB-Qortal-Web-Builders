/**
 * Owner-gated, revision-checked saves with read-back verification.
 *
 * `saveEntity` is the only write path for content. Its order is fixed:
 *   1. owner check (`owner.status === 'owner'`), before anything else;
 *   2. schema validation of the entity to be published;
 *   3. revision check: the remote revision must be the one the owner edited
 *      (`expectedRev`), or the entity must not exist yet when creating;
 *   4. publish through the writer;
 *   5. read back the published resource and compare it field by field.
 *
 * A save is reported as `saved` only after step 5 matches. Anything else is a
 * named outcome, never a silent success.
 */

import type { JsonValue, QdnReader, QdnWriter } from '../qortal/adapter';
import type { OwnerState } from '../qortal/owner';
import type { AnyEntity } from './schema';
import { SCHEMA_VERSION, validateEntity } from './schema';

export type SaveOutcome =
  | { readonly status: 'saved'; readonly entity: AnyEntity }
  | { readonly status: 'unauthorized'; readonly reason: string }
  | { readonly status: 'invalid'; readonly errors: readonly string[] }
  | { readonly status: 'conflict'; readonly remoteRev: number | null; readonly message: string }
  | { readonly status: 'read-failed'; readonly message: string }
  | { readonly status: 'publish-failed'; readonly message: string }
  | { readonly status: 'verification-failed'; readonly mismatches: readonly string[] };

export interface SaveDeps {
  readonly owner: OwnerState;
  /** The publishing name, e.g. the WEBSITE identity. */
  readonly name: string;
  readonly reader: QdnReader;
  readonly writer: QdnWriter;
  /** Read-back attempts; Core may take a moment to index a fresh publish. */
  readonly readBackAttempts?: number;
  readonly readBackDelayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Deterministic JSON text: object keys sorted, `undefined` dropped. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortKeys(item));
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const item = record[key];
      if (item !== undefined) sorted[key] = sortKeys(item);
    }
    return sorted;
  }
  return value;
}

/** Paths at which two values differ. Empty when they are equal. */
export function diffPaths(expected: unknown, actual: unknown, path = '$'): string[] {
  if (canonicalJson(expected) === canonicalJson(actual)) return [];

  const expectedIsObject = typeof expected === 'object' && expected !== null;
  const actualIsObject = typeof actual === 'object' && actual !== null;
  if (expectedIsObject && actualIsObject && Array.isArray(expected) === Array.isArray(actual)) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    const paths: string[] = [];
    for (const key of [...keys].sort()) {
      const childExpected = (expected as Record<string, unknown>)[key];
      const childActual = (actual as Record<string, unknown>)[key];
      if (childExpected === undefined && childActual === undefined) continue;
      paths.push(...diffPaths(childExpected, childActual, `${path}.${key}`));
    }
    return paths.length > 0 ? paths : [path];
  }
  return [path];
}

export type RevisionCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly remoteRev: number | null; readonly message: string };

/**
 * `expectedRev === null` means "create": the entity must not exist remotely.
 * Otherwise the remote entity must exist at exactly `expectedRev`. A mismatch means
 * someone else (or another tab) published first, and the owner must reload.
 */
export function checkRevision(expectedRev: number | null, remote: AnyEntity | null): RevisionCheck {
  const remoteRev = remote?.rev ?? null;
  if (expectedRev === null) {
    return remote === null
      ? { ok: true }
      : { ok: false, remoteRev, message: 'an entity with this identifier already exists' };
  }
  if (remote === null) {
    return { ok: false, remoteRev, message: 'the entity no longer exists remotely' };
  }
  if (remote.rev !== expectedRev) {
    return {
      ok: false,
      remoteRev,
      message: `remote revision is ${remote.rev}, expected ${expectedRev}; reload before saving`,
    };
  }
  return { ok: true };
}

/** Compares the value read back from the network with the value that was published. */
export function verifyReadBack(expected: AnyEntity, actual: unknown): readonly string[] {
  return diffPaths(expected, actual);
}

const DEFAULT_ATTEMPTS = 5;
const DEFAULT_DELAY_MS = 3000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function saveEntity(
  deps: SaveDeps,
  candidate: unknown,
  expectedRev: number | null,
): Promise<SaveOutcome> {
  // 1. Owner check before anything else.
  if (deps.owner.status !== 'owner') {
    return { status: 'unauthorized', reason: deps.owner.reason };
  }

  // 2. Schema validation.
  const validation = validateEntity(candidate, 'entity');
  if (!validation.ok) return { status: 'invalid', errors: validation.errors };
  const entity = validation.value;
  if (entity.schema !== SCHEMA_VERSION) {
    return { status: 'invalid', errors: ['entity.schema: unsupported version'] };
  }

  // 3. Revision: a save is always the next revision of what the owner edited.
  const requiredRev = (expectedRev ?? 0) + 1;
  if (entity.rev !== requiredRev) {
    return {
      status: 'invalid',
      errors: [`entity.rev: expected ${requiredRev} after the edit, received ${entity.rev}`],
    };
  }

  let remoteValue: unknown;
  try {
    remoteValue = await deps.reader.fetchJson(deps.name, entity.id);
  } catch (error) {
    return { status: 'read-failed', message: errorMessage(error) };
  }
  let remote: AnyEntity | null = null;
  if (remoteValue !== null) {
    const remoteValidation = validateEntity(remoteValue, 'remote');
    if (!remoteValidation.ok) {
      return { status: 'read-failed', message: 'the published entity does not validate' };
    }
    remote = remoteValidation.value;
  }
  const revision = checkRevision(expectedRev, remote);
  if (!revision.ok)
    return { status: 'conflict', remoteRev: revision.remoteRev, message: revision.message };

  // 4. Publish.
  try {
    await deps.writer.publishJson({
      name: deps.name,
      identifier: entity.id,
      title: entity.title,
      value: entity as unknown as JsonValue,
    });
  } catch (error) {
    return { status: 'publish-failed', message: errorMessage(error) };
  }

  // 5. Read back and compare.
  const attempts = Math.max(1, deps.readBackAttempts ?? DEFAULT_ATTEMPTS);
  const delay = deps.readBackDelayMs ?? DEFAULT_DELAY_MS;
  const sleep = deps.sleep ?? wait;
  let mismatches: readonly string[] = ['entity: not visible after publish'];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const readBack = await deps.reader.fetchJson(deps.name, entity.id);
      if (readBack !== null) {
        mismatches = verifyReadBack(entity, readBack);
        if (mismatches.length === 0) return { status: 'saved', entity };
      }
    } catch (error) {
      mismatches = [`read-back failed: ${errorMessage(error)}`];
    }
    if (attempt < attempts) await sleep(delay);
  }
  return { status: 'verification-failed', mismatches };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
