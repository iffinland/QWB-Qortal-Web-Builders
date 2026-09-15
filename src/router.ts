/**
 * Hash-based routing.
 *
 * The refreshed app stays a single-entry `WEBSITE` resource (approved decision
 * D1): Core's index-fallback routing applies only to `APP` resources, so every
 * dynamic view must live in the URL hash. `#/...` selects a view; a bare
 * `#section_N` keeps the published site's in-page anchor links working and is
 * resolved as "home view, scroll to that section".
 */

export type Route =
  | { readonly kind: 'home'; readonly anchor?: string }
  | { readonly kind: 'works' }
  | { readonly kind: 'posts' }
  | { readonly kind: 'post'; readonly slug: string }
  | { readonly kind: 'not-found'; readonly hash: string };

const SECTION_ANCHOR = /^section_[a-z0-9_]+$/;
const POST_PATH = /^\/post\/([a-z0-9-]+)$/;

export function parseRoute(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const path = raw.trim();

  if (path === '' || path === '/') return { kind: 'home' };
  if (path === '/works') return { kind: 'works' };
  if (path === '/posts') return { kind: 'posts' };

  const post = POST_PATH.exec(path);
  if (post?.[1] !== undefined) return { kind: 'post', slug: post[1] };

  if (SECTION_ANCHOR.test(path)) return { kind: 'home', anchor: path };

  return { kind: 'not-found', hash: path };
}

/**
 * Stable identity of a route, excluding the in-page anchor: used to decide
 * whether a hash change is a real view change (scroll to top) or only a scroll
 * target inside the view already on screen.
 */
export function routeKey(route: Route): string {
  switch (route.kind) {
    case 'home':
      return 'home';
    case 'works':
      return 'works';
    case 'posts':
      return 'posts';
    case 'post':
      return `post:${route.slug}`;
    case 'not-found':
      return `not-found:${route.hash}`;
  }
}
