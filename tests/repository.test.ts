import { describe, expect, it } from 'vitest';

import { seedBundle } from '../src/content/seed';
import {
  FEATURED_WORK_LIMIT,
  FALLBACK_WORK_COUNT,
  activeEntities,
  createSeedSource,
  featuredWorks,
  findArticleBySlug,
  findWorkBySlug,
  publicEntities,
  sortForDisplay,
} from '../src/content/repository';
import type { WorkEntity } from '../src/content/schema';

function workWith(id: string, order: number, createdAt: number): WorkEntity {
  return { ...seedBundle.works[0]!, id, order, createdAt, title: id };
}

describe('content repository', () => {
  it('loads the seed source as ready, with a public and a raw projection', async () => {
    const result = await createSeedSource().load();
    expect(result.status).toBe('ready');
    expect(result.origin).toBe('seed');
    expect(result.diagnostics).toEqual([]);
    expect(result.bundle.works.length).toBe(seedBundle.works.length);
    expect(result.raw.works.length).toBe(seedBundle.works.length);
  });

  it('removes deleted and hidden entities from the public projection only', async () => {
    const base = seedBundle.works[0]!;
    const deleted: WorkEntity = { ...seedBundle.works[1]!, state: 'deleted', deletedAt: 1 };
    const hidden: WorkEntity = { ...seedBundle.works[2]!, hidden: true };
    const raw = { ...seedBundle, works: [base, deleted, hidden] };

    expect(activeEntities(raw.works)).toHaveLength(2);
    expect(publicEntities(raw.works).map((item) => item.id)).toEqual([base.id]);

    const result = await createSeedSource().load();
    expect(result.bundle.works.every((item) => item.state === 'active' && !item.hidden)).toBe(true);
  });

  it('orders deterministically by order, creation time and identifier', () => {
    const a = workWith('qwb_work_a-1', 20, 100);
    const b = workWith('qwb_work_b-2', 10, 200);
    const c = workWith('qwb_work_c-3', 10, 100);
    expect(sortForDisplay([a, b, c]).map((entity) => entity.id)).toEqual([c.id, b.id, a.id]);
  });

  it('selects featured projects for the homepage, capped, with a fallback', () => {
    const featured = featuredWorks(seedBundle);
    expect(featured.every((work) => work.payload.featured)).toBe(true);
    expect(featured.length).toBeLessThanOrEqual(FEATURED_WORK_LIMIT);

    const none = {
      ...seedBundle,
      works: seedBundle.works.map((work) => ({
        ...work,
        payload: { ...work.payload, featured: false },
      })),
    };
    expect(featuredWorks(none)).toHaveLength(FALLBACK_WORK_COUNT);
  });

  it('finds projects and articles by their public slug', () => {
    expect(findWorkBySlug(seedBundle, 'asot-a-state-of-trance')?.title).toContain('ASOT');
    expect(findWorkBySlug(seedBundle, 'missing')).toBeUndefined();
    expect(findArticleBySlug(seedBundle, 'valuing-your-time')?.title).toBe('Valuing your time');
    expect(findArticleBySlug(seedBundle, 'missing')).toBeUndefined();
  });
});
