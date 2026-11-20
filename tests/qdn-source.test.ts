import { describe, expect, it, vi } from 'vitest';

import { createQdnSource } from '../src/content/qdn-source';
import { createSeedSource } from '../src/content/repository';
import { seedBundle } from '../src/content/seed';
import { memoryReader, publishedStore, allSeedEntities } from './helpers';

const options = (reader: ReturnType<typeof memoryReader>) => ({
  reader,
  name: 'Qortal Web Builders',
  prefix: 'qwb_',
  limit: 500,
  fallback: createSeedSource(),
});

describe('QDN content source', () => {
  it('loads the published entities as ready, hiding hidden and deleted ones from visitors', async () => {
    const store = publishedStore();
    const hidden = { ...seedBundle.services[0]!, hidden: true };
    const deleted = { ...seedBundle.services[1]!, state: 'deleted' as const, deletedAt: 1 };
    store.set(hidden.id, hidden);
    store.set(deleted.id, deleted);

    const result = await createQdnSource(options(memoryReader(store))).load();
    expect(result.origin).toBe('qdn');
    expect(result.status).toBe('ready');
    expect(result.bundle.services.map((service) => service.id)).not.toContain(hidden.id);
    expect(result.bundle.services.map((service) => service.id)).not.toContain(deleted.id);
    expect(result.raw.services.map((service) => service.id)).toEqual(
      expect.arrayContaining([hidden.id, deleted.id]),
    );
  });

  it('falls back to the seed with a reason when QDN cannot be reached', async () => {
    const reader = memoryReader(new Map(), { searchError: new Error('HTTP 404') });
    const result = await createQdnSource(options(reader)).load();
    expect(result.origin).toBe('seed');
    expect(result.status).toBe('partial');
    expect(result.diagnostics[0]).toContain('QDN is unavailable');
    expect(result.bundle.works.length).toBeGreaterThan(0);
  });

  it('falls back when the site singleton has not been published yet', async () => {
    const store = publishedStore(allSeedEntities().filter((entity) => entity.kind !== 'site'));
    const result = await createQdnSource(options(memoryReader(store))).load();
    expect(result.origin).toBe('seed');
    expect(result.diagnostics.join(' ')).toContain('site entity is not published');
    expect(result.publishedIds).toHaveLength(allSeedEntities().length - 1);
  });

  it('merges an already-published edit into seed content before the site singleton exists', async () => {
    const service = seedBundle.services[0]!;
    const changed = { ...service, rev: 2, title: 'Published service title' };
    const store = publishedStore([changed]);
    const result = await createQdnSource(options(memoryReader(store))).load();
    expect(result.origin).toBe('seed');
    expect(result.raw.services.find((item) => item.id === service.id)?.title).toBe(
      'Published service title',
    );
    expect(result.publishedIds).toContain(service.id);
  });

  it('skips an invalid entity, reports it, and keeps the rest', async () => {
    const store = publishedStore();
    store.set(seedBundle.works[0]!.id, { ...seedBundle.works[0]!, payload: { broken: true } });
    const result = await createQdnSource(options(memoryReader(store))).load();
    expect(result.origin).toBe('qdn');
    expect(result.status).toBe('partial');
    expect(result.diagnostics.join(' ')).toContain('skipped');
    expect(result.bundle.works).toHaveLength(seedBundle.works.length - 1);
  });

  it('rejects a payload whose id does not match the identifier it was read under', async () => {
    const store = publishedStore();
    const moved = { ...seedBundle.services[0]! };
    store.set(seedBundle.services[1]!.id, moved);
    const result = await createQdnSource(options(memoryReader(store))).load();
    expect(result.diagnostics.join(' ')).toContain('does not match its identifier');
  });

  it('treats a bundle-level conflict (duplicate slug) as inconsistent and falls back', async () => {
    const store = publishedStore();
    const first = seedBundle.works[0]!;
    const second = seedBundle.works[1]!;
    store.set(second.id, { ...second, payload: { ...second.payload, slug: first.payload.slug } });
    const result = await createQdnSource(options(memoryReader(store))).load();
    expect(result.origin).toBe('seed');
    expect(result.diagnostics.join(' ')).toContain('inconsistent');
  });

  it('never throws, so the app always has content to show', async () => {
    const reader = {
      searchIdentifiers: vi.fn(() => Promise.reject(new Error('boom'))),
      fetchJson: vi.fn(),
    };
    await expect(createQdnSource(options(reader)).load()).resolves.toMatchObject({
      origin: 'seed',
    });
  });
});
