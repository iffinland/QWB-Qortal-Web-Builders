/**
 * QWB application boot.
 *
 * 1. Load content: published QDN entities (public, no auth) with a controlled
 *    fallback to the built-in beta seed.
 * 2. Resolve the owner (fail-closed): visitors never see owner tools.
 * 3. Resolve the hash route and render the shell: navbar, view, owner panel
 *    (owners only), footer. Owner saves re-render in place, without a rebuild.
 */

import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/theme.css';
import './styles/components.css';

import { CONTENT_PREFIX, SEARCH_LIMIT, resolvePublishingName } from './config';
import { createQdnSource } from './content/qdn-source';
import {
  createSeedSource,
  findArticleBySlug,
  findWorkBySlug,
  publicBundle,
} from './content/repository';
import type { ContentLoadResult, ContentSource } from './content/repository';
import type { ContentBundle } from './content/schema';
import { SECTION_IDS } from './content/schema';
import {
  createBridgeWriter,
  createHttpReader,
  detectBridge,
  fetchNameOwner,
} from './qortal/adapter';
import type { OwnerState } from './qortal/owner';
import { VISITOR_REASON_TEXT, isOwner, resolveOwner } from './qortal/owner';
import { escapeHtml } from './ui/html';
import { parseRoute, routeKey } from './router';
import type { Route } from './router';
import { mountOwnerConsole, ownerSectionButtons, renderOwnerConsole } from './owner/console';
import { renderNavbar } from './views/navbar';
import { renderFooter } from './views/footer';
import { createHomeView } from './views/home';
import { createWorksView } from './views/works-page';
import { createWorkView } from './views/work-page';
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
    case 'work': {
      const work = findWorkBySlug(content, route.slug);
      return work === undefined
        ? createNotFoundView(content, `/work/${route.slug}`)
        : createWorkView(content, work);
    }
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

/**
 * Puts an owner "Edit" button at the top of each section. The button scrolls to the
 * matching collection in the owner panel, or opens the site-text editor directly.
 */
function addOwnerSectionButtons(app: HTMLElement): void {
  const buttons = ownerSectionButtons();
  for (const [sectionId, spec] of Object.entries(buttons)) {
    const section = app.querySelector<HTMLElement>(`#${sectionId}`);
    if (section === null || section.querySelector('.owner-section-edit') !== null) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn custom-btn owner-section-edit';
    button.textContent = spec.label;
    button.addEventListener('click', () => {
      const panel = app.querySelector<HTMLElement>('#owner-console');
      if (panel === null) return;
      if (spec.target === 'site') {
        panel
          .querySelector<HTMLButtonElement>('[data-action="edit"][data-collection="site"]')
          ?.click();
      } else {
        panel.querySelector<HTMLElement>(`#owner-collection-${spec.target}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    });
    section.prepend(button);
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

async function boot(): Promise<void> {
  const app = document.getElementById('app');
  if (app === null) throw new Error('#app is missing from index.html');

  // The publishing identity comes from the render URL, never from the build.
  const publishingName = resolvePublishingName(window.location.pathname);
  const seed = createSeedSource();
  const source: ContentSource =
    publishingName === null
      ? seed
      : createQdnSource({
          reader: createHttpReader(),
          name: publishingName,
          prefix: CONTENT_PREFIX,
          limit: SEARCH_LIMIT,
          fallback: seed,
        });

  const bridge = detectBridge(window);
  let loaded: ContentLoadResult = await source.load();
  const owner: OwnerState = await resolveOwner({
    ownerName: publishingName,
    bridge,
    nameOwner: (name) => fetchNameOwner(name),
  });

  let currentRoute = parseRoute(window.location.hash);
  let teardownNavbar: (() => void) | null = null;
  let ownerNotice = '';

  const render = (route: Route): void => {
    const content = loaded.bundle;
    const view = resolveView(route, content);
    const activeHref =
      route.kind === 'home' && route.anchor !== undefined ? `#${route.anchor}` : '';

    const notice =
      loaded.status === 'ready'
        ? ''
        : `<p class="content-notice" role="status">Some content could not be loaded from Qortal, so the built-in version is shown in places.</p>`;
    const ownerPanel = isOwner(owner) ? renderOwnerConsole(loaded.raw, owner, ownerNotice) : '';

    // Owner tools sit right under the navbar. While owner access is being verified,
    // a one-line status states why owner tools are off (temporary diagnostic).
    const ownerStatus = !isOwner(owner)
      ? `<p class="owner-status" role="status">Owner tools are off: ${escapeHtml(VISITOR_REASON_TEXT[owner.reason])}</p>`
      : '';

    app.innerHTML = `${renderNavbar(content.site, activeHref)}
${ownerPanel}
${ownerStatus}
${notice}
${view.html}
${renderFooter(content.site)}`;

    applyMeta(view);
    view.mount?.(app, { content });

    if (isOwner(owner)) addOwnerSectionButtons(app);

    if (isOwner(owner)) {
      const panel = app.querySelector<HTMLElement>('#owner-console');
      if (panel !== null) {
        mountOwnerConsole(panel, {
          raw: loaded.raw,
          deps: {
            owner,
            name: publishingName ?? '',
            reader: createHttpReader(),
            writer: createBridgeWriter(
              bridge ?? { request: () => Promise.reject(new Error('no bridge')) },
            ),
          },
          onRawChange: (raw, message) => {
            loaded = { ...loaded, raw, bundle: publicBundle(raw) };
            ownerNotice = message;
            render(currentRoute);
          },
        });
      }
    }

    teardownNavbar?.();
    teardownNavbar = mountNavbar(route.kind === 'home' ? { scrollSpySectionIds: SECTION_IDS } : {});

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

    ownerNotice = '';
    render(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (loaded.diagnostics.length > 0) console.warn('QWB content diagnostics:', loaded.diagnostics);

  mountSkipLink();
  mountScrollToTop();
  render(currentRoute);
  window.addEventListener('hashchange', handleHashChange);
}

/**
 * Last-resort guard: an unexpected boot failure must never leave the public page
 * blank. The static fallback still names the site and gives a working contact path.
 */
function renderBootFailure(error: unknown): void {
  console.error('QWB boot failed:', error);
  const app = document.getElementById('app');
  if (app === null) return;
  app.innerHTML = `<main id="main-content" class="container py-5" tabindex="-1">
<h1>Qortal Web Builders</h1>
<p>Custom websites and custom Qortal apps. The page could not start its dynamic content, but the contact details below still work.</p>
<p><a href="#contact">Contact and request a free quote</a></p>
</main>`;
}

void boot().catch(renderBootFailure);
