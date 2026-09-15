/**
 * The compact owner bar and its re-validation entry point.
 *
 * `§9.4` of the approved proposal puts the global, non-cascading information in
 * the bar (owner-mode status + publishing name, publishing status, unsaved
 * changes, re-check); `§9.5` collapses it to a badge that opens a sheet on a
 * phone. These tests pin both behaviours against the real shell, and pin that the
 * bar's "Re-check owner mode" is a *privileged revalidation*: when the account no
 * longer owns the publishing name the whole owner layer disappears.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { QortalAction } from '../src/qortal/bridge';
import { closeAllModals } from '../src/ui/modal';
import { clearToasts } from '../src/ui/toast';
import type { OwnerHarness } from './support/owner';
import {
  identityFrom,
  ownerHarness,
  RENDER_OWNER_SCOPE,
  scriptedBridge,
  settle,
} from './support/owner';

const OWNER_NAME = 'Qortal Web Builders';

/** jsdom has no `matchMedia`; the shell must treat its absence as "no room". */
function stubMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function accountBridge(names: () => readonly string[]) {
  return scriptedBridge((action: QortalAction) => {
    if (action === 'GET_USER_ACCOUNT') {
      return Promise.resolve({ address: 'QOwnerAddress', publicKey: 'pk' });
    }
    if (action === 'GET_ACCOUNT_NAMES') {
      return Promise.resolve(names().map((name) => ({ name })));
    }
    return Promise.reject(new Error(`unexpected action ${action}`));
  });
}

async function ownerWithBar(): Promise<OwnerHarness> {
  return ownerHarness({
    route: { kind: 'home' },
    app: identityFrom(RENDER_OWNER_SCOPE),
    bridge: accountBridge(() => [OWNER_NAME]),
    beforeMount: (session) => session.reverify('boot').then(() => undefined),
  });
}

function barOf(app: HTMLElement): HTMLElement {
  const bar = app.querySelector<HTMLElement>('#qwb-owner-bar');
  if (bar === null) throw new Error('no owner bar');
  return bar;
}

function barBody(app: HTMLElement): HTMLElement {
  const body = app.querySelector<HTMLElement>('#qwb-owner-bar-body');
  if (body === null) throw new Error('no owner bar body');
  return body;
}

function barButton(app: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(barOf(app).querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (button === undefined) throw new Error(`no bar button labelled ${label}`);
  return button;
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  closeAllModals();
  clearToasts();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('owner bar', () => {
  it('carries the global owner information, not a dashboard', async () => {
    const h = await ownerWithBar();
    const bar = barOf(h.app);

    expect(bar.getAttribute('role')).toBe('region');
    expect(bar.textContent).toContain('Owner mode');
    expect(bar.textContent).toContain(OWNER_NAME);
    expect(bar.textContent).toContain('verified by name ownership');
    expect(barBody(h.app).textContent).toContain('Publishing: off (Phase 2)');
    expect(barBody(h.app).textContent).toContain('nothing is saved or published');
    expect(barBody(h.app).textContent).toContain('No unsaved changes');
    expect(barButton(h.app, 'Publishing status')).toBeInstanceOf(HTMLButtonElement);
    expect(barButton(h.app, 'Re-check owner mode')).toBeInstanceOf(HTMLButtonElement);

    h.destroy();
  });

  it('starts expanded where there is room and collapsed on a phone', async () => {
    stubMatchMedia(true);
    const desktop = await ownerWithBar();
    expect(barBody(desktop.app).hasAttribute('hidden')).toBe(false);
    const desktopToggle = barButton(desktop.app, 'Hide owner tools');
    expect(desktopToggle.getAttribute('aria-expanded')).toBe('true');
    expect(desktopToggle.getAttribute('aria-controls')).toBe('qwb-owner-bar-body');
    desktop.destroy();

    document.body.replaceChildren();
    stubMatchMedia(false);
    const phone = await ownerWithBar();
    expect(barBody(phone.app).hasAttribute('hidden')).toBe(true);
    expect(barButton(phone.app, 'Show owner tools').getAttribute('aria-expanded')).toBe('false');

    // The badge row stays: the sheet is one tap away, not a hidden feature.
    expect(barOf(phone.app).textContent).toContain('Owner mode');
    phone.destroy();
  });

  it('lets the owner collapse and expand it', async () => {
    stubMatchMedia(true);
    const h = await ownerWithBar();
    expect(barBody(h.app).hasAttribute('hidden')).toBe(false);

    barButton(h.app, 'Hide owner tools').click();
    expect(barBody(h.app).hasAttribute('hidden')).toBe(true);
    expect(barButton(h.app, 'Show owner tools').getAttribute('aria-expanded')).toBe('false');

    barButton(h.app, 'Show owner tools').click();
    expect(barBody(h.app).hasAttribute('hidden')).toBe(false);

    h.destroy();
  });

  it('removes the whole owner layer when a re-check finds the name is no longer owned', async () => {
    let owned: readonly string[] = [OWNER_NAME];
    const h = await ownerHarness({
      route: { kind: 'home' },
      app: identityFrom(RENDER_OWNER_SCOPE),
      bridge: accountBridge(() => owned),
      beforeMount: (session) => session.reverify('boot').then(() => undefined),
    });
    expect(h.session.state.status).toBe('owner');
    expect(h.app.querySelectorAll('.qwb-ctl').length).toBeGreaterThan(0);

    owned = ['Q-Website'];
    barButton(h.app, 'Re-check owner mode').click();
    await settle();

    expect(h.session.state.status).toBe('visitor');
    expect(h.app.querySelector('#qwb-owner-bar')).toBeNull();
    expect(h.app.querySelector('[data-qwb-owner]')).toBeNull();
    expect(h.app.querySelector('.qwb-ctl')).toBeNull();
    expect(document.body.textContent).toContain('Owner mode is no longer confirmed');
    expect(document.body.textContent).toContain('nothing was published');

    h.destroy();
  });

  it('never renders the bar for a session that is not the owner', async () => {
    const h = await ownerHarness({
      route: { kind: 'home' },
      app: identityFrom(RENDER_OWNER_SCOPE),
      bridge: accountBridge(() => ['Q-Website']),
      beforeMount: (session) => session.reverify('boot').then(() => undefined),
    });

    expect(h.session.state.status).toBe('visitor');
    expect(h.app.querySelector('#qwb-owner-bar')).toBeNull();

    h.destroy();
  });
});
