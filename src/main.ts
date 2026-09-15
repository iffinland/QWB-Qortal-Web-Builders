/**
 * QWB application boot.
 *
 * Phase 1: load the typed seed content, resolve the hash route, render the
 * shell (navbar + view + footer) and wire the native interactions. There is no
 * bridge call, no owner mode and no QDN write in this phase; Phase 2 adds owner
 * recognition inside the same view `mount()` hooks, and Phase 3 swaps the seed
 * source for a QDN-backed one.
 */

import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/theme.css';
import './styles/components.css';

import type { ContentBundle } from './content/schema';
import { createSeedSource, findArticleBySlug } from './content/repository';
import { parseRoute, routeKey } from './router';
import type { Route } from './router';
import { renderNavbar } from './views/navbar';
import { renderFooter } from './views/footer';
import { createHomeView } from './views/home';
import { createWorksView } from './views/works-page';
import { createPostsView } from './views/posts-page';
import { createPostView } from './views/post-page';
import { createNotFoundView } from './views/not-found';
import type { View } from './views/types';
import { mountNavbar } from './ui/nav';
import { mountScrollToTop } from './ui/scroll-to-top';
import { RESERVED_FOCUS_HASHES, focusMainContent, mountSkipLink } from './ui/skip-link';

function resolveView(route: Route, content: ContentBundle): View {
  switch (route.kind) {
    case 'home':
      return createHomeView(content);
    case 'works':
      return createWorksView(content);
    case 'posts':
      return createPostsView(content);
    case 'post': {
      const article = findArticleBySlug(content, route.slug);
      return article === undefined
        ? createNotFoundView(content, `/post/${route.slug}`)
        : createPostView(content, article);
    }
    case 'not-found':
      return createNotFoundView(content, route.hash);
  }
}

function applyMeta(view: View): void {
  document.title = view.title;
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description !== null) description.content = view.description;
}

function scrollToAnchor(anchor: string): boolean {
  const target = document.getElementById(anchor);
  if (target === null) return false;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

/** The home page's in-page anchor targets, in document order. */
const HOME_SECTIONS = ['section_1', 'section_2', 'section_3', 'section_5'] as const;

async function boot(): Promise<void> {
  const app = document.getElementById('app');
  if (app === null) throw new Error('#app is missing from index.html');

  const source = createSeedSource();
  const result = await source.load();

  if (result.status === 'error') {
    app.innerHTML = `<main id="main-content" class="container section-padding">
      <h1>Content could not be loaded</h1>
      <p>The seed content failed validation (${result.diagnostics.length} problem(s)).</p>
    </main>`;
    return;
  }

  const content = result.bundle;
  let currentRoute = parseRoute(window.location.hash);
  let teardownNavbar: (() => void) | null = null;

  const render = (route: Route): void => {
    const view = resolveView(route, content);
    const activeHref =
      route.kind === 'home' && route.anchor !== undefined ? `#${route.anchor}` : '';

    app.innerHTML = `${renderNavbar(content.site, activeHref)}
${view.html}
${renderFooter(content.site)}`;

    applyMeta(view);
    view.mount?.(app, { content });

    teardownNavbar?.();
    teardownNavbar = mountNavbar(
      route.kind === 'home' ? { scrollSpySectionIds: HOME_SECTIONS } : {},
    );

    if (route.kind === 'home' && route.anchor !== undefined) scrollToAnchor(route.anchor);
  };

  const handleHashChange = (): void => {
    // A focus target is not a route: honour the focus and keep the current view.
    if (RESERVED_FOCUS_HASHES.includes(window.location.hash)) {
      focusMainContent();
      return;
    }

    const next = parseRoute(window.location.hash);
    const sameView = routeKey(next) === routeKey(currentRoute);
    currentRoute = next;

    if (sameView) {
      if (next.kind === 'home' && next.anchor !== undefined) scrollToAnchor(next.anchor);
      return;
    }

    render(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  mountSkipLink();
  mountScrollToTop();
  render(currentRoute);
  window.addEventListener('hashchange', handleHashChange);
}

void boot();
