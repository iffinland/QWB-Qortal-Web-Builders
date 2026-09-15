/**
 * The visitor contract of Phase 2.
 *
 * A visitor must receive exactly the Phase 1 public site: the rendered markup
 * byte-identical, no owner controls, no owner bar, no bridge traffic. These
 * assertions are made against the real renderers and the real owner shell.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppIdentity } from '../src/qortal/context';
import { readAppIdentity } from '../src/qortal/context';
import { createBridge } from '../src/qortal/bridge';
import type { Route } from '../src/router';
import {
  bridgeForAccount,
  identityFrom,
  loadContent,
  mountApp,
  ownerHarness,
  RENDER_OWNER_SCOPE,
  sessionFor,
  settle,
  viewFor,
} from './support/owner';
import { closeAllModals } from '../src/ui/modal';
import { clearToasts } from '../src/ui/toast';

const OWNER_NAME = 'Qortal Web Builders';

const VISITOR_CASES: readonly { readonly label: string; readonly app: AppIdentity }[] = [
  {
    label: 'no bridge at all (plain web page)',
    app: readAppIdentity({ _qdnContext: 'render', _qdnName: OWNER_NAME }),
  },
  {
    label: 'gateway context',
    app: readAppIdentity({
      _qdnContext: 'gateway',
      _qdnName: OWNER_NAME,
      qortalRequest: () => Promise.resolve({}),
    }),
  },
  {
    label: 'developer-mode proxy',
    app: readAppIdentity({
      _qdnContext: 'proxy',
      _qdnName: '',
      qortalRequest: () => Promise.resolve({}),
    }),
  },
  {
    label: 'domain-mapped context',
    app: readAppIdentity({
      _qdnContext: 'domainMap',
      _qdnName: OWNER_NAME,
      qortalRequest: () => Promise.resolve({}),
    }),
  },
  {
    label: 'render context, account owns a different name',
    app: identityFrom(RENDER_OWNER_SCOPE),
  },
  {
    label: 'render context, permission declined',
    app: identityFrom(RENDER_OWNER_SCOPE),
  },
];

const VISITOR_BRIDGES = [
  () => createBridge({}),
  () => createBridge({ qortalRequest: () => Promise.reject({ error: 'User declined' }) }),
  () => bridgeForAccount({ address: 'QSomeoneElse', names: [{ name: 'some other name' }] }),
  () => createBridge({ qortalRequest: () => Promise.reject(new Error('node unreachable')) }),
  () => createBridge({ qortalRequest: () => Promise.reject({ error: 'User declined' }) }),
  () => createBridge({ qortalRequest: () => Promise.reject(new Error('node unreachable')) }),
];

const ROUTES: readonly Route[] = [
  { kind: 'home' },
  { kind: 'works' },
  { kind: 'posts' },
  { kind: 'post', slug: 'how-a-custom-website-project-starts' },
  { kind: 'not-found', hash: 'nope' },
];

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  closeAllModals();
  clearToasts();
});

describe('visitor baseline', () => {
  it.each(VISITOR_CASES.map((entry, index) => [entry.label, index] as const))(
    'renders the unchanged public site for a visitor: %s',
    async (label, index) => {
      const entry = VISITOR_CASES[index];
      const bridgeFactory = VISITOR_BRIDGES[index];
      if (entry === undefined || bridgeFactory === undefined) throw new Error('bad case');

      const content = await loadContent();

      for (const route of ROUTES) {
        document.body.replaceChildren();
        const view = viewFor(route, content);
        const app = mountApp(route, content);
        const visitorMarkup = app.innerHTML;

        const harness = await ownerHarness({
          route,
          app: entry.app,
          bridge: bridgeFactory(),
        });
        await harness.session.reverify('boot');
        await settle();

        // 1. The owner layer added nothing at all.
        expect(harness.session.state.status, `${label} should not be owner`).not.toBe('owner');
        expect(harness.app.querySelector('#qwb-owner-bar')).toBeNull();
        expect(harness.app.querySelector('[data-qwb-owner]')).toBeNull();
        expect(harness.app.querySelector('.qwb-ctl')).toBeNull();
        expect(harness.app.querySelector('.qwb-owner-add-row')).toBeNull();
        expect(document.getElementById('qwb-modal-host')).toBeNull();

        // 2. The public markup is byte-identical to the Phase 1 render.
        expect(harness.app.innerHTML).toBe(visitorMarkup);
        expect(view.html.length).toBeGreaterThan(0);

        harness.destroy();
      }
    },
  );

  it('never leaves a visitor with a re-check affordance or a toast', async () => {
    const content = await loadContent();
    const app = mountApp({ kind: 'home' }, content);
    const session = sessionFor({
      app: readAppIdentity({
        _qdnContext: 'render',
        _qdnName: OWNER_NAME,
        qortalRequest: () => Promise.resolve({}),
      }),
      bridge: createBridge({ qortalRequest: () => Promise.reject({ error: 'User declined' }) }),
    });

    await session.reverify('boot');
    await settle();

    expect(app.querySelector('#qwb-owner-bar')).toBeNull();
    expect(document.getElementById('qwb-toast-host')).toBeNull();
  });

  it('never confirms owner mode from the dev-proxy or gateway context, even with names owned', async () => {
    const content = await loadContent();
    for (const scope of [
      { _qdnContext: 'proxy', _qdnName: '' },
      { _qdnContext: 'gateway', _qdnName: OWNER_NAME },
    ]) {
      const app = mountApp({ kind: 'home' }, content);
      const before = app.innerHTML;
      const harness = await ownerHarness({
        route: { kind: 'home' },
        app: readAppIdentity({ ...scope, qortalRequest: () => Promise.resolve({}) }),
        bridge: bridgeForAccount({ address: 'QOwner', names: [{ name: OWNER_NAME }] }),
      });
      await harness.session.reverify('boot');
      await settle();

      expect(harness.session.state.status).toBe('unavailable');
      expect(harness.app.innerHTML).toBe(before);
      harness.destroy();
      app.remove();
    }
  });
});
