/**
 * QWB application boot.
 *
 * Phase 3 renders the public site from **published QDN entities** (with the
 * narrow seed fallback documented in `content/qdn-source.ts`) and attaches the
 * accepted Phase 2 owner layer on top of the same render path:
 *
 *  - `createQdnSource()` discovers the app's own entities by bounded identifier
 *    prefix search, filtered on the exact publishing name, and hydrates them
 *    through the same validators the seed path uses;
 *  - `createOwnerSession()` derives owner mode from the injected `_qdnName` and
 *    the current account's names (fail closed, never persisted);
 *  - `createOwnerShell()` attaches the owner bar and inline affordances after each
 *    render, and attaches nothing at all for a visitor;
 *  - writes go through `owner/flows.ts` → `qortal/publish.ts`: publish, then read
 *    the resource back and verify the served revision before anything is reported
 *    as published; media is published before the entity that references it;
 *  - after a verified write the content is re-read from the node and re-rendered,
 *    so the page always shows served truth rather than an optimistic edit.
 */

import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/theme.css';
import './styles/components.css';
import './styles/owner.css';

import type { ContentBundle } from './content/schema';
import { findArticleBySlug } from './content/repository';
import { createQdnSource } from './content/qdn-source';
import { escapeHtml } from './ui/html';
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
import { createWriteLog } from './owner/writes';
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

  const appIdentity = readAppIdentity();
  const bridge = createBridge();
  const source = createQdnSource({ app: appIdentity, bridge });
  const result = await source.load();

  if (result.status === 'error') {
    app.innerHTML = `<main id="main-content" class="container section-padding">
      <h1>Content could not be loaded</h1>
      <p>The published content could not be read from this node (${result.diagnostics.length} diagnostic(s)). Reload once the node is reachable.</p>
      <ul>${result.diagnostics.map((diagnostic) => `<li>${escapeHtml(diagnostic)}</li>`).join('')}</ul>
    </main>`;
    return;
  }

  let content = result.bundle;
  let currentRoute = parseRoute(window.location.hash);
  let teardownNavbar: (() => void) | null = null;

  const session = createOwnerSession({ app: appIdentity, bridge });
  const drafts = createDraftStore();
  const writes = createWriteLog();
  const ownerFlows = createOwnerFlows({
    session,
    drafts,
    writes,
    getContent: () => content,
    loadContent: async () => {
      const reloaded = await source.load();
      content = reloaded.bundle;
      return reloaded;
    },
    requestRerender: () => {
      render(currentRoute);
    },
  });
  const ownerShell = createOwnerShell({
    session,
    drafts,
    writes,
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
