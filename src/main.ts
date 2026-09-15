/**
 * QWB application boot.
 *
 * Phase 1 renders the public site from the typed seed content. Phase 2 adds the
 * owner layer on top of the same render path:
 *
 *  - `createOwnerSession()` derives owner mode from the injected `_qdnName` and
 *    the current account's names (fail closed, never persisted);
 *  - `createOwnerShell()` attaches the owner bar and inline affordances after
 *    each render, and attaches nothing at all for a visitor;
 *  - owner mode is re-verified on boot, before every privileged action, on
 *    visibility regain and after a route change while the last check was
 *    inconclusive;
 *  - no QDN read or write exists in this phase: the owner layer only reads the
 *    seed bundle and shows what Phase 3 will publish.
 */

import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/theme.css';
import './styles/components.css';
import './styles/owner.css';

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
import { createBridge } from './qortal/bridge';
import { readAppIdentity } from './qortal/context';
import { createOwnerSession } from './owner/session';
import { createDraftStore } from './owner/drafts';
import { createOwnerFlows } from './owner/flows';
import { createOwnerShell } from './owner/shell';

const SESSION_CHECK_ON_ROUTE_CHANGE = true;

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

  const appIdentity = readAppIdentity();
  const session = createOwnerSession({ app: appIdentity, bridge: createBridge() });
  const drafts = createDraftStore();
  const ownerFlows = createOwnerFlows({
    session,
    drafts,
    getContent: () => content,
    requestRerender: () => {
      render(currentRoute);
    },
  });
  const ownerShell = createOwnerShell({
    session,
    drafts,
    flows: ownerFlows,
    view: () => ({ route: currentRoute, content }),
    requestRerender: () => {
      render(currentRoute);
    },
  });

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

    // Owner UI is attached after the public DOM exists, and never before it.
    ownerShell.attach(app);

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
    if (SESSION_CHECK_ON_ROUTE_CHANGE) session.maybeReverify('route-change');
  };

  mountSkipLink();
  mountScrollToTop();
  render(currentRoute);
  session.start();
  window.addEventListener('hashchange', handleHashChange);
}

void boot();
