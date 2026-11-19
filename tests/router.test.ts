import { describe, expect, it } from 'vitest';

import { parseRoute, routeKey, workHash } from '../src/router';
import { RESERVED_FOCUS_HASHES, focusMainContent } from '../src/ui/skip-link';

describe('hash routing: one-page home', () => {
  it('resolves the home view from empty and root hashes', () => {
    expect(parseRoute('')).toEqual({ kind: 'home' });
    expect(parseRoute('#')).toEqual({ kind: 'home' });
    expect(parseRoute('#/')).toEqual({ kind: 'home' });
  });

  it('resolves every one-page section anchor', () => {
    expect(parseRoute('#hero')).toEqual({ kind: 'home', anchor: 'hero' });
    expect(parseRoute('#services')).toEqual({ kind: 'home', anchor: 'services' });
    expect(parseRoute('#portfolio')).toEqual({ kind: 'home', anchor: 'portfolio' });
    expect(parseRoute('#how-it-works')).toEqual({ kind: 'home', anchor: 'how-it-works' });
    expect(parseRoute('#pricing')).toEqual({ kind: 'home', anchor: 'pricing' });
    expect(parseRoute('#contact')).toEqual({ kind: 'home', anchor: 'contact' });
  });
});

describe('legacy #section_N anchors', () => {
  it('maps each legacy anchor onto its one-page section', () => {
    expect(parseRoute('#section_1')).toEqual({ kind: 'home', anchor: 'hero' });
    expect(parseRoute('#section_2')).toEqual({ kind: 'home', anchor: 'services' });
    expect(parseRoute('#section_3')).toEqual({ kind: 'home', anchor: 'pricing' });
    expect(parseRoute('#section_4')).toEqual({ kind: 'home', anchor: 'how-it-works' });
    expect(parseRoute('#section_5')).toEqual({ kind: 'home', anchor: 'contact' });
  });

  it('does not treat unknown legacy numbers as routes', () => {
    expect(parseRoute('#section_9')).toEqual({ kind: 'not-found', hash: 'section_9' });
  });
});

describe('project and article routes', () => {
  it('resolves a project page from its slug', () => {
    expect(parseRoute('#/work/asot-a-state-of-trance')).toEqual({
      kind: 'work',
      slug: 'asot-a-state-of-trance',
    });
    expect(workHash('iffi-vaba-mees')).toBe('#/work/iffi-vaba-mees');
  });

  it('resolves the full project list and the article routes', () => {
    expect(parseRoute('#/works')).toEqual({ kind: 'works' });
    expect(parseRoute('#/posts')).toEqual({ kind: 'posts' });
    expect(parseRoute('#/post/valuing-your-time')).toEqual({
      kind: 'post',
      slug: 'valuing-your-time',
    });
  });

  it('falls back to not-found for malformed slugs rather than a wrong view', () => {
    expect(parseRoute('#/work/UPPER')).toEqual({ kind: 'not-found', hash: '/work/UPPER' });
    expect(parseRoute('#/work/a/b')).toEqual({ kind: 'not-found', hash: '/work/a/b' });
    expect(parseRoute('#/work/')).toEqual({ kind: 'not-found', hash: '/work/' });
    expect(parseRoute('#/post/UPPER')).toEqual({ kind: 'not-found', hash: '/post/UPPER' });
    expect(parseRoute('#/nope')).toEqual({ kind: 'not-found', hash: '/nope' });
  });

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
    main.remove();
  });

  it('separates a real view change from an in-page anchor hop', () => {
    expect(routeKey(parseRoute('#/'))).toBe(routeKey(parseRoute('#pricing')));
    expect(routeKey(parseRoute('#/work/a'))).not.toBe(routeKey(parseRoute('#/work/b')));
    expect(routeKey(parseRoute('#/'))).not.toBe(routeKey(parseRoute('#/works')));
    expect(routeKey(parseRoute('#section_2'))).toBe(routeKey(parseRoute('#/')));
  });
});
