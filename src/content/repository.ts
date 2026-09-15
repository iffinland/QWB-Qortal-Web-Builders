/**
 * Content access boundary.
 *
 * Phase 1 loads the typed seed bundle. Phase 2/3 replace `createSeedSource()`
 * with a QDN-backed source (bounded SEARCH_QDN_RESOURCES by identifier prefix,
 * post-filtered by publishing name, payloads fetched with bounded concurrency)
 * without changing the views: they only ever see `ContentLoadResult`.
 *
 * Deletion semantics are already implemented here because every read path in
 * the approved architecture must filter tombstones (Qortal has no
 * app-accessible QDN delete, so a delete is a republished `state: 'deleted'`).
 */

import type { AnyEntity, ContentBundle } from './schema';
import { validateBundle } from './schema';
import { seedBundle } from './seed';

export type ContentStatus = 'ready' | 'partial' | 'error';

export interface ContentLoadResult {
  readonly status: ContentStatus;
  readonly bundle: ContentBundle;
  /** Human-readable diagnostics; Phase 2/3 surface these instead of guessing. */
  readonly diagnostics: readonly string[];
}

export interface ContentSource {
  readonly id: string;
  readonly describe: string;
  load(): Promise<ContentLoadResult>;
}

/** Tombstone filter: applied on every read path. */
export function activeEntities<E extends AnyEntity>(entities: readonly E[]): readonly E[] {
  return entities.filter((entity) => entity.state === 'active');
}

/** Deterministic ordering: sparse `order`, then creation time, then identifier. */
export function sortForDisplay<E extends AnyEntity>(entities: readonly E[]): readonly E[] {
  return [...entities].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function prepareBundle(bundle: ContentBundle): ContentBundle {
  return {
    site: bundle.site,
    highlights: sortForDisplay(activeEntities(bundle.highlights)),
    services: sortForDisplay(activeEntities(bundle.services)),
    steps: sortForDisplay(activeEntities(bundle.steps)),
    works: sortForDisplay(activeEntities(bundle.works)),
    prices: sortForDisplay(activeEntities(bundle.prices)),
    articles: sortForDisplay(activeEntities(bundle.articles)),
  };
}

export function createSeedSource(): ContentSource {
  return {
    id: 'seed',
    describe: 'typed Phase-1 seed content (no QDN read)',
    load: () => {
      const validation = validateBundle(seedBundle);
      if (!validation.ok) {
        return Promise.resolve({
          status: 'error' as const,
          bundle: seedBundle,
          diagnostics: validation.errors,
        });
      }
      return Promise.resolve({
        status: 'ready' as const,
        bundle: prepareBundle(validation.value),
        diagnostics: [],
      });
    },
  };
}

export function findArticleBySlug(
  bundle: ContentBundle,
  slug: string,
): ContentBundle['articles'][number] | undefined {
  return bundle.articles.find((article) => article.payload.slug === slug);
}

/**
 * Works shown in the home page's "Completed works" tab.
 *
 * The pane is a three-column row, so at most three are selected: fewer leaves a
 * visibly incomplete row (the published site filled all three). `featured` is
 * the owner-controlled flag; when nothing is flagged the first works in display
 * order are used so the pane is never empty.
 */
export const FEATURED_WORK_LIMIT = 3;

export function featuredWorks(bundle: ContentBundle): ContentBundle['works'] {
  const featured = bundle.works.filter((work) => work.payload.featured);
  const selection = featured.length > 0 ? featured : bundle.works;
  return selection.slice(0, FEATURED_WORK_LIMIT);
}
