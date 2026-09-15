/**
 * Test support for the owner layer.
 *
 * The harness mounts the real renderers (navbar + view + footer) exactly as
 * `main.ts` does, then attaches the real owner shell, so the visitor-cleanliness
 * and fail-closed assertions are made against the production render path rather
 * than a mock of it.
 */

import type { ContentBundle } from '../../src/content/schema';
import { createSeedSource } from '../../src/content/repository';
import type { Route } from '../../src/router';
import { renderNavbar } from '../../src/views/navbar';
import { renderFooter } from '../../src/views/footer';
import { createHomeView } from '../../src/views/home';
import { createWorksView } from '../../src/views/works-page';
import { createPostsView } from '../../src/views/posts-page';
import { createPostView } from '../../src/views/post-page';
import { createNotFoundView } from '../../src/views/not-found';
import type { View } from '../../src/views/types';
import type { AppIdentity, QdnGlobalScope } from '../../src/qortal/context';
import { readAppIdentity } from '../../src/qortal/context';
import type { QortalAction, QortalBridge, QortalRequest } from '../../src/qortal/bridge';
import { createBridge } from '../../src/qortal/bridge';
import type { OwnerSession } from '../../src/owner/session';
import { createOwnerSession } from '../../src/owner/session';
import { createDraftStore } from '../../src/owner/drafts';
import { createWriteLog } from '../../src/owner/writes';
import { createOwnerFlows } from '../../src/owner/flows';
import type { ContentLoadResult } from '../../src/content/repository';
import type { ImageEncoder } from '../../src/owner/media';
import type { OwnerShell } from '../../src/owner/shell';
import { createOwnerShell } from '../../src/owner/shell';

export async function loadContent(): Promise<ContentBundle> {
  const result = await createSeedSource().load();
  if (result.status === 'error') throw new Error('seed content is invalid');
  return result.bundle;
}

export function viewFor(route: Route, content: ContentBundle): View {
  switch (route.kind) {
    case 'home':
      return createHomeView(content);
    case 'works':
      return createWorksView(content);
    case 'posts':
      return createPostsView(content);
    case 'post': {
      const article = content.articles.find((entry) => entry.payload.slug === route.slug);
      return article === undefined
        ? createNotFoundView(content, `/post/${route.slug}`)
        : createPostView(content, article);
    }
    case 'not-found':
      return createNotFoundView(content, route.hash);
  }
}

/** Mounts `#app` with the same shell markup `main.ts` produces. */
export function mountApp(route: Route, content: ContentBundle): HTMLElement {
  const view = viewFor(route, content);
  const app = document.createElement('div');
  app.id = 'app';
  app.innerHTML = `${renderNavbar(content.site, '')}\n${view.html}\n${renderFooter(content.site)}`;
  document.body.append(app);
  view.mount?.(app, { content });
  return app;
}

export function identityFrom(scope: QdnGlobalScope): AppIdentity {
  return readAppIdentity(scope);
}

export const RENDER_OWNER_SCOPE: QdnGlobalScope = {
  _qdnContext: 'render',
  _qdnService: 'WEBSITE',
  _qdnName: 'Qortal Web Builders',
  _qdnIdentifier: 'default',
  qortalRequest: () => Promise.resolve({}),
};

export const RENDER_VISITOR_SCOPE: QdnGlobalScope = { ...RENDER_OWNER_SCOPE };

/** A bridge backed by a scripted handler, exercised through the real wrapper. */
export function scriptedBridge(
  handler: (action: QortalAction, request: QortalRequest) => Promise<unknown>,
): QortalBridge {
  return createBridge({
    qortalRequest: (request: QortalRequest) => handler(request.action as QortalAction, request),
  });
}

export interface OwnerNamesResponse {
  readonly address?: string;
  readonly names?: readonly (string | { readonly name: string })[];
}

export function bridgeForAccount(response: OwnerNamesResponse): QortalBridge {
  return scriptedBridge((action) => {
    if (action === 'GET_USER_ACCOUNT') {
      return Promise.resolve({ address: response.address ?? 'QOwnerAddress', publicKey: 'pk' });
    }
    if (action === 'GET_ACCOUNT_NAMES') return Promise.resolve(response.names ?? []);
    return Promise.reject(new Error(`unexpected action ${action}`));
  });
}

export function sessionFor(options: {
  readonly app?: AppIdentity;
  readonly bridge: QortalBridge;
  readonly doc?: Document;
  readonly autoReverifyMinIntervalMs?: number;
}): OwnerSession {
  return createOwnerSession({
    app: options.app ?? identityFrom(RENDER_OWNER_SCOPE),
    bridge: options.bridge,
    ...(options.doc === undefined ? {} : { doc: options.doc }),
    ...(options.autoReverifyMinIntervalMs === undefined
      ? {}
      : { autoReverifyMinIntervalMs: options.autoReverifyMinIntervalMs }),
  });
}

export interface OwnerHarness {
  readonly app: HTMLElement;
  readonly session: OwnerSession;
  readonly shell: OwnerShell;
  readonly content: () => ContentBundle;
  readonly drafts: ReturnType<typeof createDraftStore>;
  readonly writes: ReturnType<typeof createWriteLog>;
  readonly rerenders: () => number;
  destroy(): void;
}

export async function ownerHarness(options: {
  readonly route: Route;
  readonly app: AppIdentity;
  readonly bridge: QortalBridge;
  /** Runs before the shell attaches, e.g. to settle the boot check. */
  readonly beforeMount?: (session: OwnerSession) => Promise<void>;
  /** Overrides the re-read the owner flows perform after a verified write. */
  readonly loadContent?: () => Promise<ContentLoadResult>;
  readonly encodeImage?: ImageEncoder;
  /** Verification budget for the write pipeline (tests keep it at one attempt). */
  readonly verifyAttempts?: number;
  readonly verifyDelayMs?: number;
  readonly initialContent?: ContentBundle;
}): Promise<OwnerHarness> {
  const current = options.initialContent ?? (await loadContent());
  const app = mountApp(options.route, current);
  const drafts = createDraftStore();
  const writes = createWriteLog();
  const session = sessionFor({ app: options.app, bridge: options.bridge });
  let renders = 0;
  const rerender = (): void => {
    renders += 1;
  };
  const flows = createOwnerFlows({
    session,
    drafts,
    writes,
    getContent: () => current,
    loadContent:
      options.loadContent ??
      (() => Promise.resolve({ status: 'ready' as const, bundle: current, diagnostics: [] })),
    requestRerender: rerender,
    verifyAttempts: options.verifyAttempts ?? 1,
    verifyDelayMs: options.verifyDelayMs ?? 0,
    ...(options.encodeImage === undefined ? {} : { encodeImage: options.encodeImage }),
  });
  const shell = createOwnerShell({
    session,
    drafts,
    writes,
    flows,
    view: () => ({ route: options.route, content: current }),
    requestRerender: rerender,
  });

  if (options.beforeMount !== undefined) await options.beforeMount(session);
  shell.attach(app);

  return {
    app,
    session,
    shell,
    content: () => current,
    drafts,
    writes,
    rerenders: () => renders,
    destroy() {
      shell.destroy();
    },
  };
}

export function click(element: Element): void {
  if (!(element instanceof HTMLElement)) throw new Error('not an element');
  element.click();
}

export function buttonWithLabel(root: ParentNode, label: string): HTMLButtonElement {
  const match = Array.from(root.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-label') === label || button.textContent?.trim() === label,
  );
  if (match === undefined) throw new Error(`no button labelled ${label}`);
  return match;
}

/** Lets queued microtasks (and one macrotask) settle. */
export async function settle(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
