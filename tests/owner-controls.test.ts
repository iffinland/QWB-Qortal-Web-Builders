import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ownerTargetsFor } from '../src/owner/targets';
import { createOwnerFlows } from '../src/owner/flows';
import { createDraftStore } from '../src/owner/drafts';
import { createWriteLog } from '../src/owner/writes';
import { mountOwnerControls } from '../src/owner/controls';
import type { AppIdentity } from '../src/qortal/context';
import {
  bridgeForAccount,
  identityFrom,
  loadContent,
  mountApp,
  RENDER_OWNER_SCOPE,
  sessionFor,
  settle,
} from './support/owner';
import { activeModalCount, closeAllModals } from '../src/ui/modal';
import { clearToasts } from '../src/ui/toast';

const OWNER_NAME = 'Qortal Web Builders';

function ownerIdentity(): AppIdentity {
  return identityFrom(RENDER_OWNER_SCOPE);
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  closeAllModals();
  clearToasts();
});

describe('owner target map', () => {
  it('maps every editable home section to a container that exists in the page', async () => {
    const content = await loadContent();
    const app = mountApp({ kind: 'home' }, content);
    const targets = ownerTargetsFor({ kind: 'home' }, content);

    for (const singleton of targets.singletons) {
      expect(app.querySelectorAll(singleton.hostSelector).length, singleton.key).toBeGreaterThan(0);
    }
    for (const add of targets.adds) {
      expect(app.querySelectorAll(add.hostSelector).length, add.key).toBeGreaterThan(0);
    }
    for (const [group, expected] of Object.entries(targets.expectedCounts)) {
      const first = targets.items.find((item) => item.groupKey === group);
      expect(first, `${group} should have item targets`).toBeDefined();
      if (first === undefined) continue;
      expect(app.querySelectorAll(first.hostSelector).length, group).toBe(expected);
    }
  });

  it('maps the works, posts and article-header surfaces', async () => {
    const content = await loadContent();
    const slug = content.articles[0]?.payload.slug ?? '';
    const cases = [
      { route: { kind: 'works' } as const, groups: ['works'], adds: 1 },
      { route: { kind: 'posts' } as const, groups: ['articles'], adds: 1 },
      { route: { kind: 'post', slug } as const, groups: ['article-header'], adds: 0 },
    ];

    for (const testCase of cases) {
      const app = mountApp(testCase.route, content);
      const targets = ownerTargetsFor(testCase.route, content);
      expect(Object.keys(targets.expectedCounts).sort(), testCase.route.kind).toEqual(
        [...testCase.groups].sort(),
      );
      expect(targets.adds).toHaveLength(testCase.adds);
      for (const item of targets.items) {
        expect(app.querySelector(item.hostSelector), `${item.key} host`).not.toBeNull();
      }
      app.remove();
    }
  });

  it('has no attachment points on the not-found view', async () => {
    const content = await loadContent();
    const targets = ownerTargetsFor({ kind: 'not-found', hash: 'nope' }, content);

    expect(targets.items).toHaveLength(0);
    expect(targets.singletons).toHaveLength(0);
    expect(targets.adds).toHaveLength(0);
  });
});

describe('inline owner controls', () => {
  it('adds a control group to every mapped entity for the owner', async () => {
    const content = await loadContent();
    const app = mountApp({ kind: 'home' }, content);
    const targets = ownerTargetsFor({ kind: 'home' }, content);
    const session = sessionFor({
      app: ownerIdentity(),
      bridge: bridgeForAccount({ address: 'QOwner', names: [{ name: OWNER_NAME }] }),
    });
    const flows = createOwnerFlows({
      session,
      drafts: createDraftStore(),
      writes: createWriteLog(),
      getContent: () => content,
      loadContent: () =>
        Promise.resolve({ status: 'ready' as const, bundle: content, diagnostics: [] }),
      requestRerender: () => undefined,
    });

    const result = mountOwnerControls(app, targets, { flows, drafts: createDraftStore() });

    expect(result.diagnostics).toEqual([]);
    expect(app.querySelectorAll('[data-qwb-owner="controls"]').length).toBe(
      targets.items.length + targets.singletons.length,
    );
    expect(app.querySelectorAll('[data-qwb-owner="add"]').length).toBe(targets.adds.length);
    // Always visible (no hover gating) and labelled for assistive technology.
    const editButton = app.querySelector<HTMLButtonElement>('[aria-label^="Edit highlights:"]');
    expect(editButton).not.toBeNull();
    expect(app.querySelector('.qwb-owner-add-row button')?.textContent).toContain('+');

    result.teardown();
    expect(app.querySelectorAll('[data-qwb-owner]')).toHaveLength(0);
  });

  it('fails closed when the DOM does not match the entity count', async () => {
    const content = await loadContent();
    const app = mountApp({ kind: 'home' }, content);
    // Simulate renderer drift: remove one featured card from the page.
    app
      .querySelector('#section_featured article.custom-block')
      ?.closest('[class*="col-"]')
      ?.remove();

    const targets = ownerTargetsFor({ kind: 'home' }, content);
    const session = sessionFor({
      app: ownerIdentity(),
      bridge: bridgeForAccount({ address: 'QOwner', names: [{ name: OWNER_NAME }] }),
    });
    const flows = createOwnerFlows({
      session,
      drafts: createDraftStore(),
      writes: createWriteLog(),
      getContent: () => content,
      loadContent: () =>
        Promise.resolve({ status: 'ready' as const, bundle: content, diagnostics: [] }),
      requestRerender: () => undefined,
    });

    const result = mountOwnerControls(app, targets, { flows, drafts: createDraftStore() });

    expect(result.diagnostics.join(' ')).toContain('highlights');
    expect(app.querySelector('[aria-label^="Edit highlights:"]')).toBeNull();
    // Other groups still work.
    expect(app.querySelector('[aria-label^="Edit prices:"]')).not.toBeNull();
  });

  it('opens the edit form from an inline control when the session is owner', async () => {
    const content = await loadContent();
    const app = mountApp({ kind: 'home' }, content);
    const targets = ownerTargetsFor({ kind: 'home' }, content);
    const session = sessionFor({
      app: ownerIdentity(),
      bridge: bridgeForAccount({ address: 'QOwner', names: [{ name: OWNER_NAME }] }),
    });
    const flows = createOwnerFlows({
      session,
      drafts: createDraftStore(),
      writes: createWriteLog(),
      getContent: () => content,
      loadContent: () =>
        Promise.resolve({ status: 'ready' as const, bundle: content, diagnostics: [] }),
      requestRerender: () => undefined,
    });
    mountOwnerControls(app, targets, { flows, drafts: createDraftStore() });

    app.querySelector<HTMLButtonElement>('[aria-label^="Edit highlights:"]')?.click();
    await settle();

    expect(activeModalCount()).toBe(1);
    const form = document.querySelector<HTMLFormElement>('[data-qwb-form]');
    expect(form).not.toBeNull();
    const title = form?.elements.namedItem('title');
    // Pre-filled from the current seed model, not blank.
    expect(title).toBeInstanceOf(HTMLInputElement);
    expect((title as HTMLInputElement).value).toBe(content.highlights[0]?.title);
    closeAllModals();
  });
});
