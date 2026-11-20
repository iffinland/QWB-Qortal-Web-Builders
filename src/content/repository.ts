/**
 * Content access boundary.
 *
 * A `ContentSource` produces a `ContentLoadResult` with two bundles:
 *  - `raw`    every validated entity, including hidden and deleted ones. Only the
 *             owner console reads it, after an owner check.
 *  - `bundle` the public projection: active, not hidden, deterministically sorted.
 *             Views only ever see this one.
 *
 * Deletion is logical (Qortal has no app-accessible QDN delete), so the tombstone
 * and hidden filters run on every public read path.
 */

import type { AnyEntity, ArticleEntity, ContentBundle, WorkEntity } from './schema';
import { validateBundle } from './schema';
import { seedBundle } from './seed';

export type ContentStatus = 'ready' | 'partial' | 'error';

export interface ContentLoadResult {
  readonly status: ContentStatus;
  /** Where the content came from: published QDN entities, or the built-in seed. */
  readonly origin: 'qdn' | 'seed';
  /** Public projection used by every view. */
  readonly bundle: ContentBundle;
  /** Every validated entity, hidden and deleted included. Owner tools only. */
  readonly raw: ContentBundle;
  /** Human-readable diagnostics for the console and the content notice. */
  readonly diagnostics: readonly string[];
  /** Entity identifiers confirmed to exist remotely (empty for pure seed content). */
  readonly publishedIds: readonly string[];
}

export interface ContentSource {
  readonly id: string;
  readonly describe: string;
  load(): Promise<ContentLoadResult>;
}

/** Tombstone filter: a deleted entity is never shown. */
export function activeEntities<E extends AnyEntity>(entities: readonly E[]): readonly E[] {
  return entities.filter((entity) => entity.state === 'active');
}

/** Public filter: active and not hidden by the owner. */
export function publicEntities<E extends AnyEntity>(entities: readonly E[]): readonly E[] {
  return activeEntities(entities).filter((entity) => !entity.hidden);
}

/** Deterministic ordering: sparse `order`, then creation time, then identifier. */
export function sortForDisplay<E extends AnyEntity>(entities: readonly E[]): readonly E[] {
  return [...entities].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Sorted, unfiltered copy: the owner console lists everything, in display order. */
export function sortBundle(bundle: ContentBundle): ContentBundle {
  return {
    site: bundle.site,
    services: sortForDisplay(bundle.services),
    steps: sortForDisplay(bundle.steps),
    works: sortForDisplay(bundle.works),
    prices: sortForDisplay(bundle.prices),
    articles: sortForDisplay(bundle.articles),
  };
}

/** Public projection of a bundle. */
export function publicBundle(bundle: ContentBundle): ContentBundle {
  return {
    site: bundle.site,
    services: sortForDisplay(publicEntities(bundle.services)),
    steps: sortForDisplay(publicEntities(bundle.steps)),
    works: sortForDisplay(publicEntities(bundle.works)),
    prices: sortForDisplay(publicEntities(bundle.prices)),
    articles: sortForDisplay(publicEntities(bundle.articles)),
  };
}

/** Seed source: validated typed content, no network. */
export function createSeedSource(): ContentSource {
  return {
    id: 'seed',
    describe: 'built-in beta seed content (no QDN read)',
    load: () => {
      const validation = validateBundle(seedBundle);
      if (!validation.ok) {
        return Promise.resolve({
          status: 'error' as const,
          origin: 'seed' as const,
          bundle: publicBundle(seedBundle),
          raw: sortBundle(seedBundle),
          diagnostics: validation.errors,
          publishedIds: [],
        });
      }
      return Promise.resolve({
        status: 'ready' as const,
        origin: 'seed' as const,
        bundle: publicBundle(validation.value),
        raw: sortBundle(validation.value),
        diagnostics: [],
        publishedIds: [],
      });
    },
  };
}

export function findArticleBySlug(bundle: ContentBundle, slug: string): ArticleEntity | undefined {
  return bundle.articles.find((article) => article.payload.slug === slug);
}

export function findWorkBySlug(bundle: ContentBundle, slug: string): WorkEntity | undefined {
  return bundle.works.find((work) => work.payload.slug === slug);
}

/** Homepage portfolio: at most this many projects. */
export const FEATURED_WORK_LIMIT = 6;

/** When nothing is flagged as featured, the first projects in display order are used. */
export const FALLBACK_WORK_COUNT = 3;

/**
 * Projects shown on the homepage. The owner's `featured` flag selects them;
 * when nothing is flagged the first few projects keep the section populated.
 */
export function featuredWorks(bundle: ContentBundle): readonly WorkEntity[] {
  const flagged = bundle.works.filter((work) => work.payload.featured);
  const selection = flagged.length > 0 ? flagged : bundle.works.slice(0, FALLBACK_WORK_COUNT);
  return selection.slice(0, FEATURED_WORK_LIMIT);
}
