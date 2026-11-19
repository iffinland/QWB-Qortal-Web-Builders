/**
 * Hash-based routing.
 *
 * The app is a single-entry `WEBSITE` resource (Core's index-fallback applies only
 * to `APP` resources), so every view lives in the URL hash:
 *
 *   #/ or empty          home (one page: hero, services, portfolio, how it works,
 *                        pricing and quotes, contact)
 *   #services, #portfolio, #how-it-works, #pricing, #contact, #hero
 *                        home, scrolled to that section
 *   #section_1 … #section_5
 *                        legacy published anchors, mapped onto the sections
 *   #/works              all projects
 *   #/work/<slug>        one project
 *   #/posts              article index
 *   #/post/<slug>        one article
 *   anything else        not found
 *
 * `#main-content` is reserved as a focus target (skip link), not a route.
 */

import { SECTION_IDS, isValidSlug } from './content/schema';
import type { SectionId } from './content/schema';

export type Route =
  | { readonly kind: 'home'; readonly anchor?: SectionId }
  | { readonly kind: 'works' }
  | { readonly kind: 'work'; readonly slug: string }
  | { readonly kind: 'posts' }
  | { readonly kind: 'post'; readonly slug: string }
  | { readonly kind: 'not-found'; readonly hash: string };

/** Legacy published anchors and the one-page section each now lands on. */
export const LEGACY_SECTION_ANCHORS: Readonly<Record<string, SectionId>> = {
  section_1: 'hero',
  section_2: 'services',
  section_3: 'pricing',
  section_4: 'how-it-works',
  section_5: 'contact',
};

const WORK_PATH = /^\/work\/([^/]+)$/;
const POST_PATH = /^\/post\/([^/]+)$/;

function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}

export function parseRoute(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const path = raw.trim();

  if (path === '' || path === '/') return { kind: 'home' };
  if (isSectionId(path)) return { kind: 'home', anchor: path };
  const legacy = LEGACY_SECTION_ANCHORS[path];
  if (legacy !== undefined) return { kind: 'home', anchor: legacy };

  if (path === '/works') return { kind: 'works' };
  if (path === '/posts') return { kind: 'posts' };

  const work = WORK_PATH.exec(path);
  if (work?.[1] !== undefined && isValidSlug(work[1])) return { kind: 'work', slug: work[1] };

  const post = POST_PATH.exec(path);
  if (post?.[1] !== undefined && isValidSlug(post[1])) return { kind: 'post', slug: post[1] };

  return { kind: 'not-found', hash: path };
}

/**
 * Stable identity of a route, excluding the in-page anchor: a hash change within
 * the same view scrolls to the anchor instead of re-rendering the page.
 */
export function routeKey(route: Route): string {
  switch (route.kind) {
    case 'home':
      return 'home';
    case 'works':
      return 'works';
    case 'work':
      return `work:${route.slug}`;
    case 'posts':
      return 'posts';
    case 'post':
      return `post:${route.slug}`;
    case 'not-found':
      return `not-found:${route.hash}`;
  }
}

export function workHash(slug: string): string {
  return `#/work/${slug}`;
}

export function postHash(slug: string): string {
  return `#/post/${slug}`;
}
