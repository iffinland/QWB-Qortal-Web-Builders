import { describe, expect, it } from 'vitest';

import { parseRoute, routeKey } from '../src/router';
import { RESERVED_FOCUS_HASHES, focusMainContent } from '../src/ui/skip-link';

describe('hash routing', () => {
  it('resolves the home view from empty and root hashes', () => {
    expect(parseRoute('')).toEqual({ kind: 'home' });
    expect(parseRoute('#')).toEqual({ kind: 'home' });
    expect(parseRoute('#/')).toEqual({ kind: 'home' });
  });

  it('resolves the listing and detail views', () => {
    expect(parseRoute('#/works')).toEqual({ kind: 'works' });
    expect(parseRoute('#/posts')).toEqual({ kind: 'posts' });
    expect(parseRoute('#/post/valuing-your-time')).toEqual({
      kind: 'post',
      slug: 'valuing-your-time',
    });
  });

  it('treats the legacy section anchors as home + scroll target', () => {
    expect(parseRoute('#section_2')).toEqual({ kind: 'home', anchor: 'section_2' });
    expect(parseRoute('#section_5')).toEqual({ kind: 'home', anchor: 'section_5' });
  });

  it('falls back to not-found rather than to the wrong view', () => {
    expect(parseRoute('#/nope')).toEqual({ kind: 'not-found', hash: '/nope' });
    expect(parseRoute('#/post/UPPER')).toEqual({ kind: 'not-found', hash: '/post/UPPER' });
    expect(parseRoute('#/post/')).toEqual({ kind: 'not-found', hash: '/post/' });
  });

  /**
   * Regression: the skip link's `#main-content` target used to reach the router,
   * which resolved it as an unknown route and replaced the page with the
   * not-found view. The hash is reserved and focus is moved instead.
   */
  it('keeps the skip-link hash out of the view routes', () => {
    expect(RESERVED_FOCUS_HASHES).toContain('#main-content');
    expect(parseRoute('#main-content')).toEqual({ kind: 'not-found', hash: 'main-content' });
  });

  it('focuses the main region without needing a route', () => {
    const main = document.createElement('main');
    main.id = 'main-content';
    document.body.append(main);
    expect(focusMainContent()).toBe(true);
    expect(document.activeElement).toBe(main);
    expect(main.getAttribute('tabindex')).toBe('-1');
    main.remove();
  });

  it('separates a real view change from an in-page anchor hop', () => {
    expect(routeKey(parseRoute('#/'))).toBe(routeKey(parseRoute('#section_3')));
    expect(routeKey(parseRoute('#/post/a'))).not.toBe(routeKey(parseRoute('#/post/b')));
    expect(routeKey(parseRoute('#/'))).not.toBe(routeKey(parseRoute('#/works')));
  });
});
