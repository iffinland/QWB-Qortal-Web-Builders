import { describe, expect, it, vi } from 'vitest';

import { canonicalJson, checkRevision, diffPaths, saveEntity } from '../src/content/save';
import type { QdnWriter } from '../src/qortal/adapter';
import { seedBundle } from '../src/content/seed';
import type { AnyEntity, WorkEntity } from '../src/content/schema';
import { memoryReader, publishedStore } from './helpers';

const OWNER = { status: 'owner' as const, name: 'owner', address: 'QOWNER' };
const NAME = 'Qortal Web Builders';
const sleep = vi.fn(() => Promise.resolve());

function editedWork(revision: number): WorkEntity {
  return { ...seedBundle.works[0]!, rev: revision, updatedAt: 1, title: 'Edited title' };
}

/** A writer that stores what it is given into the same store the reader serves. */
function storingWriter(
  store: Map<string, unknown>,
  transform: (value: unknown) => unknown = (v) => v,
): QdnWriter {
  return {
    publishJson: ({ identifier, value }) => {
      store.set(identifier, transform(structuredClone(value)));
      return Promise.resolve();
    },
  };
}

describe('canonical comparison', () => {
  it('ignores key order and treats undefined as absent', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(
      canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }),
    );
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it('reports the exact paths that differ', () => {
    expect(diffPaths({ a: { b: 1 }, c: 2 }, { a: { b: 2 }, c: 2 })).toEqual(['$.a.b']);
    expect(diffPaths({ a: 1 }, { a: 1 })).toEqual([]);
    expect(diffPaths({ list: [1, 2] }, { list: [1, 3] })).toEqual(['$.list.1']);
  });
});

describe('revision checks', () => {
  const remote = seedBundle.works[0]!;

  it('allows a create only when nothing is published under the identifier', () => {
    expect(checkRevision(null, null)).toEqual({ ok: true });
    expect(checkRevision(null, remote).ok).toBe(false);
  });

  it('requires the remote revision to be the one the owner edited', () => {
    expect(checkRevision(remote.rev, remote)).toEqual({ ok: true });
    const stale = checkRevision(remote.rev - 1, remote);
    expect(stale.ok).toBe(false);
    expect(stale.ok === false && stale.message).toContain('reload');
    expect(checkRevision(1, null).ok).toBe(false);
  });
});

describe('saveEntity verification', () => {
  it('reports saved only after the read-back matches the published entity', async () => {
    const store = publishedStore();
    const outcome = await saveEntity(
      {
        owner: OWNER,
        name: NAME,
        reader: memoryReader(store),
        writer: storingWriter(store),
        sleep,
      },
      editedWork(2),
      1,
    );
    expect(outcome.status).toBe('saved');
    expect(store.get(seedBundle.works[0]!.id)).toMatchObject({ title: 'Edited title', rev: 2 });
  });

  it('reports verification-failed with the mismatching paths when the stored value differs', async () => {
    const store = publishedStore();
    const writer = storingWriter(store, (value) => ({
      ...(value as AnyEntity),
      title: 'Something else',
    }));
    const outcome = await saveEntity(
      {
        owner: OWNER,
        name: NAME,
        reader: memoryReader(store),
        writer,
        readBackAttempts: 2,
        readBackDelayMs: 0,
        sleep,
      },
      editedWork(2),
      1,
    );
    expect(outcome.status).toBe('verification-failed');
    if (outcome.status === 'verification-failed') expect(outcome.mismatches).toContain('$.title');
  });

  it('retries the read-back, because a fresh publish may take time to appear', async () => {
    const store = publishedStore();
    let reads = 0;
    const reader = memoryReader(store);
    const slowReader = {
      ...reader,
      fetchJson: async (name: string, identifier: string) => {
        if (
          identifier === seedBundle.works[0]!.id &&
          (store.get(identifier) as { rev?: number } | undefined)?.rev === 2
        ) {
          reads += 1;
          if (reads < 3) return null;
        }
        return reader.fetchJson(name, identifier);
      },
    };
    const localSleep = vi.fn(() => Promise.resolve());
    const outcome = await saveEntity(
      {
        owner: OWNER,
        name: NAME,
        reader: slowReader,
        writer: storingWriter(store),
        sleep: localSleep,
      },
      editedWork(2),
      1,
    );
    expect(outcome.status).toBe('saved');
    expect(localSleep).toHaveBeenCalled();
  });

  it('refuses a save over a newer remote revision (conflict), without publishing', async () => {
    const store = publishedStore();
    store.set(seedBundle.works[0]!.id, { ...seedBundle.works[0]!, rev: 5 });
    const writer = { publishJson: vi.fn(() => Promise.resolve()) };
    const outcome = await saveEntity(
      { owner: OWNER, name: NAME, reader: memoryReader(store), writer, sleep },
      editedWork(2),
      1,
    );
    expect(outcome.status).toBe('conflict');
    expect(outcome.status === 'conflict' && outcome.remoteRev).toBe(5);
    expect(writer.publishJson).not.toHaveBeenCalled();
  });

  it('requires the revision to advance by exactly one', async () => {
    const outcome = await saveEntity(
      {
        owner: OWNER,
        name: NAME,
        reader: memoryReader(publishedStore()),
        writer: { publishJson: vi.fn(() => Promise.resolve()) },
        sleep,
      },
      editedWork(7),
      1,
    );
    expect(outcome.status).toBe('invalid');
  });

  it('reports publish failures without claiming success', async () => {
    const store = publishedStore();
    const writer = { publishJson: () => Promise.reject(new Error('platform declined')) };
    const outcome = await saveEntity(
      { owner: OWNER, name: NAME, reader: memoryReader(store), writer, sleep },
      editedWork(2),
      1,
    );
    expect(outcome).toEqual({ status: 'publish-failed', message: 'platform declined' });
  });

  it('creates a new entity only when the identifier is free', async () => {
    const store = new Map<string, unknown>();
    const fresh: WorkEntity = { ...seedBundle.works[0]!, id: 'qwb_work_brand-new-1', rev: 1 };
    const outcome = await saveEntity(
      {
        owner: OWNER,
        name: NAME,
        reader: memoryReader(store),
        writer: storingWriter(store),
        sleep,
      },
      fresh,
      null,
    );
    expect(outcome.status).toBe('saved');
  });

  it('returns read-failed when the current remote version cannot be read', async () => {
    const reader = {
      ...memoryReader(publishedStore()),
      fetchJson: () => Promise.reject(new Error('HTTP 503')),
    };
    const outcome = await saveEntity(
      {
        owner: OWNER,
        name: NAME,
        reader,
        writer: { publishJson: vi.fn(() => Promise.resolve()) },
        sleep,
      },
      editedWork(2),
      1,
    );
    expect(outcome).toEqual({ status: 'read-failed', message: 'HTTP 503' });
  });
});
