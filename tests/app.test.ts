/**
 * Integration: boots the real index.html and src/main.ts in jsdom, with every
 * `/arbitrary` and `/names` request answered 404 (as a plain host without a node
 * would). Verifies the one-page render, the seed fallback notice, legacy anchors,
 * project routes, and that a visitor gets no owner tools.
 */
import indexHtml from '../index.html?raw';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs)
      throw new Error('timed out waiting for the app to render');
    await new Promise((resolveTick) => setTimeout(resolveTick, 10));
  }
}

const app = (): HTMLElement => {
  const element = document.getElementById('app');
  if (element === null) throw new Error('#app is missing');
  return element;
};

/** jsdom has no layout: record which element each scroll targets, by id. */
const scrolledTo: string[] = [];

describe('booted application (jsdom)', () => {
  beforeAll(async () => {
    window.history.replaceState(null, '', '/render/WEBSITE/Qortal%20Web%20Builders/');
    window.location.hash = '#section_3';
    const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(indexHtml)?.[1] ?? '';
    document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
    Element.prototype.scrollIntoView = function recordScroll(this: Element): void {
      scrolledTo.push(this.id);
    };
    window.scrollTo = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 404 }))),
    );
    await import('../src/main');
    await waitFor(() => app().querySelector('#hero') !== null);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('renders the one-page home with the six sections in order', () => {
    const ids = [...app().querySelectorAll('section[id]')].map((section) => section.id);
    expect(ids).toEqual(['hero', 'services', 'portfolio', 'how-it-works', 'pricing', 'contact']);
    expect(app().querySelector('.nav-tabs')).toBeNull();
  });

  it('shows the built-in content notice when QDN cannot be read', () => {
    expect(app().querySelector('.content-notice')?.textContent).toContain('built-in version');
  });

  it('resolves the legacy #section_3 anchor and scrolls to the pricing section', () => {
    expect(scrolledTo).toContain('pricing');
  });

  it('gives visitors no owner tools', () => {
    expect(app().querySelector('#owner-console')).toBeNull();
    expect(app().querySelector('.owner-section-edit')).toBeNull();
    expect(app().querySelector('[data-action="edit"]')).toBeNull();
  });

  it('renders a project page for a hash route and the not-found view for an unknown slug', async () => {
    window.location.hash = '#/work/asot-a-state-of-trance';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(
      () => app().querySelector('h1.page-title')?.textContent?.includes('ASOT') === true,
    );
    expect(app().querySelector('.work-detail')).not.toBeNull();
    expect(document.title).toContain('ASOT');

    window.location.hash = '#/work/does-not-exist';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => app().textContent?.includes('This page is not here') === true);
  });

  it('returns from a project page to the one-page home through a section anchor', async () => {
    window.location.hash = '#portfolio';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => app().querySelector('#portfolio') !== null);
    expect(app().querySelector('#services')).not.toBeNull();
    expect(app().querySelector('.work-detail')).toBeNull();
  });
});
