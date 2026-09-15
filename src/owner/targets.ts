/**
 * Owner control attachment points.
 *
 * The public markup is unchanged: no view emits owner markup and no view knows
 * that owner mode exists. The owner layer finds its own attachment points in the
 * already-rendered DOM, using the stable structure the Phase 1 renderers produce
 * (`id="section_1"`, `#panel-1 …`, `article.custom-block`, `article.pricing-box`,
 * `.works-section`, `.posts-section`, `header.site-header`).
 *
 * Ordering is persisted by republishing an entity (`content/ordering.ts`), not by
 * moving DOM nodes, so a target describes only where the controls attach.
 *
 * Each target therefore carries a selector **plus its index among the matches**
 * and is paired with the entity list in the same order the view rendered it.
 * `mountOwnerControls` verifies the DOM count against the expected count for
 * every group and fails closed (no controls, one diagnostic) on a mismatch, so a
 * future renderer change degrades to "no owner controls" instead of attaching a
 * control to the wrong entity.
 */

import type { ContentBundle, EntityKind } from '../content/schema';
import { featuredWorks } from '../content/repository';
import type { Route } from '../router';

export type OwnerItemControl = 'edit' | 'delete' | 'up' | 'down';

/** Which slice of the `site` singleton a singleton target edits. */
export type SiteSlice = 'hero' | 'brand' | 'contact' | 'footer';

export interface OwnerSingletonTarget {
  readonly key: string;
  readonly label: string;
  readonly siteSlice: SiteSlice;
  readonly hostSelector: string;
  readonly hostIndex: number;
  readonly controls: readonly OwnerItemControl[];
}

export interface OwnerItemTarget {
  readonly key: string;
  readonly kind: EntityKind;
  readonly entityId: string;
  readonly entityTitle: string;
  readonly groupKey: string;
  readonly hostSelector: string;
  readonly hostIndex: number;
  readonly controls: readonly OwnerItemControl[];
}

export interface OwnerAddTarget {
  readonly key: string;
  readonly kind: EntityKind;
  readonly label: string;
  readonly hostSelector: string;
  readonly hostIndex: number;
  /** `row` → append a full-width column; `block` → append inside the block. */
  readonly hostRole: 'row' | 'block';
}

export interface OwnerTargetMap {
  readonly singletons: readonly OwnerSingletonTarget[];
  readonly items: readonly OwnerItemTarget[];
  readonly adds: readonly OwnerAddTarget[];
  /** Expected number of DOM matches per group, for the fail-closed count check. */
  readonly expectedCounts: Readonly<Record<string, number>>;
}

const EMPTY_MAP: OwnerTargetMap = {
  singletons: [],
  items: [],
  adds: [],
  expectedCounts: {},
};

const CARD_CONTROLS: readonly OwnerItemControl[] = ['edit', 'delete', 'up', 'down'];
const SINGLETON_CONTROLS: readonly OwnerItemControl[] = ['edit'];

function itemsFor<E extends { readonly id: string; readonly title: string }>(
  entities: readonly E[],
  options: {
    readonly kind: EntityKind;
    readonly groupKey: string;
    readonly hostSelector: string;
    readonly controls?: readonly OwnerItemControl[];
  },
): readonly OwnerItemTarget[] {
  return entities.map((entity, index) => ({
    key: `${options.groupKey}:${entity.id}`,
    kind: options.kind,
    entityId: entity.id,
    entityTitle: entity.title,
    groupKey: options.groupKey,
    hostSelector: options.hostSelector,
    hostIndex: index,
    controls: options.controls ?? CARD_CONTROLS,
  }));
}

function homeTargets(content: ContentBundle): OwnerTargetMap {
  const featured = featuredWorks(content);
  const items: OwnerItemTarget[] = [
    ...itemsFor(content.highlights, {
      kind: 'highlight',
      groupKey: 'highlights',
      hostSelector: '#section_featured article.custom-block',
    }),
    ...itemsFor(content.steps, {
      kind: 'step',
      groupKey: 'steps',
      hostSelector: '#panel-1 article.custom-block',
    }),
    ...itemsFor(featured, {
      kind: 'work',
      groupKey: 'featured-works',
      hostSelector: '#panel-2 article.custom-block',
    }),
    // Services render as bullet lines inside one single block (`div.custom-block`,
    // not an `article`), so the line is the per-entity attachment point.
    ...itemsFor(content.services, {
      kind: 'service',
      groupKey: 'services',
      hostSelector: '#panel-3 .custom-block ul > li',
    }),
    ...itemsFor(content.prices, {
      kind: 'price',
      groupKey: 'prices',
      hostSelector: '#section_3 article.pricing-box',
    }),
  ];

  return {
    singletons: [
      {
        key: 'hero',
        label: 'Hero band',
        siteSlice: 'hero',
        hostSelector: '#section_1 .container',
        hostIndex: 0,
        controls: SINGLETON_CONTROLS,
      },
      {
        key: 'contact',
        label: 'Contact block',
        siteSlice: 'contact',
        hostSelector: '#section_5 .container',
        hostIndex: 0,
        controls: SINGLETON_CONTROLS,
      },
      {
        key: 'footer',
        label: 'Footer',
        siteSlice: 'footer',
        hostSelector: '.site-footer .container',
        hostIndex: 0,
        controls: SINGLETON_CONTROLS,
      },
    ],
    items,
    adds: [
      {
        key: 'add-highlight',
        kind: 'highlight',
        label: 'Add featured card',
        hostSelector: '#section_featured .row',
        hostIndex: 0,
        hostRole: 'row',
      },
      {
        key: 'add-step',
        kind: 'step',
        label: 'Add step',
        hostSelector: '#panel-1 .row',
        hostIndex: 0,
        hostRole: 'row',
      },
      {
        key: 'add-work',
        kind: 'work',
        label: 'Add project',
        hostSelector: '#panel-2 .row',
        hostIndex: 0,
        hostRole: 'row',
      },
      {
        key: 'add-service',
        kind: 'service',
        label: 'Add build service',
        hostSelector: '#panel-3 .row',
        hostIndex: 0,
        hostRole: 'row',
      },
      {
        key: 'add-price',
        kind: 'price',
        label: 'Add pricing tier',
        hostSelector: '#section_3 .pricing-container',
        hostIndex: 0,
        hostRole: 'block',
      },
    ],
    expectedCounts: {
      highlights: content.highlights.length,
      steps: content.steps.length,
      'featured-works': featured.length,
      services: content.services.length,
      prices: content.prices.length,
    },
  };
}

function worksTargets(content: ContentBundle): OwnerTargetMap {
  return {
    singletons: [],
    items: itemsFor(content.works, {
      kind: 'work',
      groupKey: 'works',
      hostSelector: '.works-section article.custom-block',
    }),
    adds: [
      {
        key: 'add-work',
        kind: 'work',
        label: 'Add project',
        hostSelector: '.works-section .row',
        hostIndex: 0,
        hostRole: 'row',
      },
    ],
    expectedCounts: { works: content.works.length },
  };
}

function postsTargets(content: ContentBundle): OwnerTargetMap {
  return {
    singletons: [],
    items: itemsFor(content.articles, {
      kind: 'article',
      groupKey: 'articles',
      hostSelector: '.posts-section article.custom-block',
    }),
    adds: [
      {
        key: 'add-article',
        kind: 'article',
        label: 'New article',
        hostSelector: '.posts-section .row',
        hostIndex: 0,
        hostRole: 'row',
      },
    ],
    expectedCounts: { articles: content.articles.length },
  };
}

function postTargets(article: ContentBundle['articles'][number]): OwnerTargetMap {
  return {
    singletons: [],
    items: itemsFor([article], {
      kind: 'article',
      groupKey: 'article-header',
      hostSelector: 'header.site-header > .container',
      controls: ['edit', 'delete'],
    }),
    adds: [],
    expectedCounts: { 'article-header': 1 },
  };
}

/** Owner attachment points for the current route. Never throws. */
export function ownerTargetsFor(route: Route, content: ContentBundle): OwnerTargetMap {
  switch (route.kind) {
    case 'home':
      return homeTargets(content);
    case 'works':
      return worksTargets(content);
    case 'posts':
      return postsTargets(content);
    case 'post': {
      const article = content.articles.find((entry) => entry.payload.slug === route.slug);
      return article === undefined ? EMPTY_MAP : postTargets(article);
    }
    case 'not-found':
      return EMPTY_MAP;
  }
}
