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
import { isOwner, resolveOwner } from './qortal/owner';
import { parseRoute, routeKey } from './router';
import type { Route } from './router';
import { mountOwnerConsole, renderOwnerEditorHost } from './owner/console';
import { renderNavbar } from './views/navbar';
import { renderFooter } from './views/footer';
import { normalizeContactLink, resolveOwnerContactLinks } from './content/contact-link';
import { mountQdnMedia } from './ui/qdn-media';
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
function ownerButton(action: 'edit' | 'new' | 'toggle-hidden' | 'delete' | 'toggle-section' | 'toggle-footer', collection: string, id?: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = action === 'edit' ? 'owner-inline-edit' : 'owner-inline-add';
  button.dataset.action = action;
  button.dataset.collection = collection;
  if (id !== undefined) button.dataset.id = id;
  button.textContent = ({ edit: 'Edit', new: '+ Add', 'toggle-hidden': 'Hide', delete: 'Delete', 'toggle-section': 'Hide section', 'toggle-footer': 'Hide footer' })[action];
  return button;
}

/** Adds contextual controls beside the content, matching the reference dapp. */
function addInlineOwnerControls(app: HTMLElement, raw: ContentBundle): void {
  for (const target of app.querySelectorAll<HTMLElement>('[data-owner-collection][data-owner-id]')) {
    const collection = target.dataset.ownerCollection;
    const id = target.dataset.ownerId;
    if (collection && id && target.querySelector(':scope > .owner-inline-edit') === null) {
      target.classList.add('owner-editable');
      target.append(ownerButton('edit', collection, id));
      const actions = document.createElement('div');
      actions.className = 'owner-card-actions';
      actions.append(ownerButton('toggle-hidden', collection, id), ownerButton('delete', collection, id));
      target.append(actions);
    }
  }

  for (const section of raw.site.payload.sections) {
    const target = app.querySelector<HTMLElement>(`#${section.id} > .container`);
    if (!target) continue;
    const button = ownerButton('toggle-section', 'site', raw.site.id);
    button.dataset.section = section.id;
    button.textContent = section.visible ? 'Hide section' : 'Show section';
    target.prepend(button);
    if (!section.visible) target.parentElement?.classList.add('owner-hidden-content');
  }

  const collections = ['services', 'steps', 'works', 'prices', 'articles'] as const;
  const footer = app.querySelector<HTMLElement>('.site-footer');
  if (footer) {
    const toggle = ownerButton('toggle-footer', 'site', raw.site.id);
    toggle.textContent = raw.site.payload.footerVisible === false ? 'Show footer' : 'Hide footer';
    footer.querySelector('.container')?.prepend(toggle);
    if (raw.site.payload.footerVisible === false) footer.classList.add('owner-hidden-content');
  }
  const recovery = document.createElement('details');
  recovery.className = 'owner-recovery container';
  const summary = document.createElement('summary');
  summary.textContent = 'Hidden content';
  recovery.append(summary);
  for (const collection of collections) {
    for (const entity of raw[collection].filter((item) => item.hidden && item.state === 'active')) {
      const row = document.createElement('div');
      row.className = 'owner-card-actions';
      const label = document.createElement('span');
      label.textContent = entity.title;
      const show = ownerButton('toggle-hidden', collection, entity.id);
      show.textContent = 'Show';
      row.append(label, show, ownerButton('edit', collection, entity.id), ownerButton('delete', collection, entity.id));
      recovery.append(row);
    }
  }
  if (recovery.children.length > 1) app.querySelector('main')?.append(recovery);

  for (const selector of ['#hero', '#contact', '.site-footer']) {
    const target = app.querySelector<HTMLElement>(selector);
    if (target !== null && target.querySelector(':scope > .owner-inline-edit') === null) {
      target.classList.add('owner-editable');
      target.append(ownerButton('edit', 'site', raw.site.id));
    }
  }

  const addTargets: Readonly<Record<string, string>> = {
    services: '#services .section-title',
    works: '#portfolio .section-title, .works-section .container',
    steps: '#how-it-works .section-title',
    prices: '#pricing .section-title',
    articles: '.posts-section .container',
  };
  for (const [collection, selector] of Object.entries(addTargets)) {
    const target = app.querySelector<HTMLElement>(selector);
    if (target !== null && target.querySelector(`.owner-inline-add[data-collection="${collection}"]`) === null) {
      target.append(ownerButton('new', collection));
    }
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
  const initialEntities = [
    loaded.raw.site,
    ...loaded.raw.services,
    ...loaded.raw.steps,
    ...loaded.raw.works,
    ...loaded.raw.prices,
    ...loaded.raw.articles,
  ];
  const unpublishedIds = new Set(
    initialEntities
      .map((entity) => entity.id)
      .filter((id) => !loaded.publishedIds.includes(id)),
  );
  const owner: OwnerState = await resolveOwner({
    ownerName: publishingName,
    bridge,
    nameOwner: (name) => fetchNameOwner(name),
  });

  let currentRoute = parseRoute(window.location.hash);
  let teardownNavbar: (() => void) | null = null;
  let teardownOwner: (() => void) | null = null;
  let teardownMedia: (() => void) | null = null;
  let ownerNotice = '';

  const render = (route: Route): void => {
    teardownMedia?.();
    teardownOwner?.();
    teardownOwner = null;
    const content = resolveOwnerContactLinks(isOwner(owner) ? {
      ...loaded.bundle,
      site: { ...loaded.bundle.site, payload: { ...loaded.bundle.site.payload,
        sections: loaded.raw.site.payload.sections.map((section) => ({ ...section, visible: true })),
      } },
    } : loaded.bundle, publishingName);
    const view = resolveView(route, content);
    const activeHref =
      route.kind === 'home' && route.anchor !== undefined ? `#${route.anchor}` : '';

    const notice =
      loaded.status === 'ready'
        ? ''
        : `<p class="content-notice" role="status">Some content could not be loaded from Qortal, so the built-in version is shown in places.</p>`;
    const ownerEditor = isOwner(owner) ? renderOwnerEditorHost(ownerNotice) : '';

    app.innerHTML = `${renderNavbar(content.site, activeHref)}
${ownerEditor}
${notice}
${view.html}
${isOwner(owner) || content.site.payload.footerVisible !== false ? renderFooter(content.site) : ''}`;

    applyMeta(view);
    // Also repair links from older QDN resources, without republishing owner data.
    for (const link of app.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const href = link.getAttribute('href') ?? '';
      const corrected = normalizeContactLink(href, publishingName);
      if (corrected !== href) link.setAttribute('href', corrected);
    }
    view.mount?.(app, { content });
    teardownMedia = mountQdnMedia(app, bridge);

    if (isOwner(owner)) addInlineOwnerControls(app, loaded.raw);

    if (isOwner(owner)) {
      if (app.querySelector('#owner-editor') !== null) {
        teardownOwner = mountOwnerConsole(app, {
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
          unpublishedIds: [...unpublishedIds],
          onPublished: (id) => unpublishedIds.delete(id),
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
