import { describe, expect, it } from 'vitest';

import { seedBundle } from '../src/content/seed';
import {
  FEATURED_WORK_LIMIT,
  activeEntities,
  createSeedSource,
  featuredWorks,
  findArticleBySlug,
  sortForDisplay,
} from '../src/content/repository';
import type { WorkEntity } from '../src/content/schema';

function workWithOrder(id: string, order: number, createdAt: number): WorkEntity {
  return {
    ...seedBundle.works[0]!,
    id,
    order,
    createdAt,
    title: id,
  };
}

describe('content repository', () => {
  it('loads the seed source as ready with no diagnostics', async () => {
    const result = await createSeedSource().load();
    expect(result.status).toBe('ready');
    expect(result.diagnostics).toEqual([]);
    expect(result.bundle.works.length).toBe(seedBundle.works.length);
  });

  it('filters tombstones on the read path', () => {
    const tombstone: WorkEntity = {
      ...seedBundle.works[0]!,
      state: 'deleted',
      deletedAt: 1789430500000,
    };
    const list = [seedBundle.works[1]!, tombstone];
    expect(activeEntities(list)).toHaveLength(1);
    expect(activeEntities(list)[0]?.id).toBe(seedBundle.works[1]!.id);
  });

  it('orders deterministically by order, creation time and identifier', () => {
    const a = workWithOrder('qwb_work_a-1', 20, 100);
    const b = workWithOrder('qwb_work_b-2', 10, 200);
    const c = workWithOrder('qwb_work_c-3', 10, 100);
    expect(sortForDisplay([a, b, c]).map((entity) => entity.id)).toEqual([c.id, b.id, a.id]);
  });

  it('returns up to three featured works so the home row is complete', () => {
    const featured = featuredWorks(seedBundle);
    expect(featured).toHaveLength(FEATURED_WORK_LIMIT);
    expect(featured.every((work) => work.payload.featured)).toBe(true);

    const noneFeatured = {
      ...seedBundle,
      works: seedBundle.works.map((work) => ({
        ...work,
        payload: { ...work.payload, featured: false },
      })),
    };
    expect(featuredWorks(noneFeatured)).toHaveLength(FEATURED_WORK_LIMIT);
  });

  it('never returns more works than the three-column row holds', () => {
    const allFeatured = {
      ...seedBundle,
      works: seedBundle.works.map((work) => ({
        ...work,
        payload: { ...work.payload, featured: true },
      })),
    };
    expect(featuredWorks(allFeatured)).toHaveLength(FEATURED_WORK_LIMIT);
  });

  it('finds an article by its slug', () => {
    const article = findArticleBySlug(seedBundle, 'valuing-your-time');
    expect(article?.payload.slug).toBe('valuing-your-time');
    expect(findArticleBySlug(seedBundle, 'missing')).toBeUndefined();
  });
});
