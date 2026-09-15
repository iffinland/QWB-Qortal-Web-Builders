import { describe, expect, it } from 'vitest';

import {
  decideFromNames,
  determineOwner,
  extractNameList,
  normalizeName,
} from '../src/qortal/identity';
import type { AppIdentity } from '../src/qortal/context';
import { readAppIdentity } from '../src/qortal/context';
import type { QortalAction, QortalRequest } from '../src/qortal/bridge';
import { createBridge } from '../src/qortal/bridge';

const OWNER_NAME = 'Qortal Web Builders';

function renderApp(overrides: Partial<Parameters<typeof readAppIdentity>[0]> = {}): AppIdentity {
  return readAppIdentity({
    _qdnContext: 'render',
    _qdnService: 'WEBSITE',
    _qdnName: OWNER_NAME,
    qortalRequest: () => Promise.resolve({}),
    ...overrides,
  });
}

function scripted(
  handler: (action: QortalAction, request: QortalRequest) => Promise<unknown>,
): ReturnType<typeof createBridge> {
  return createBridge({
    qortalRequest: (request: QortalRequest) => handler(request.action as QortalAction, request),
  });
}

const NO_PERSISTENCE_KEYS = ['owner', 'qwb-owner', 'ownerMode', 'owner=true'];

describe('name normalisation and membership', () => {
  it('case-folds and trims without collapsing internal whitespace', () => {
    expect(normalizeName('  Qortal Web Builders ')).toBe('qortal web builders');
    expect(normalizeName('a  b')).toBe('a  b');
    expect(normalizeName('a b')).not.toBe(normalizeName('a  b'));
  });

  it('confirms owner mode from the full name list, never from names[0]', () => {
    // Live node evidence (2026-09-15): the publishing account owns two names and
    // the publishing name is not first in the response.
    const decision = decideFromNames({
      publishingName: OWNER_NAME,
      accountAddress: 'QOwner',
      accountNames: ['q-website', 'qortal web builders'],
      checkedAt: 1,
    });

    expect(decision.status).toBe('owner');
    expect(decision.reason).toBe('publishing-name-is-owned');
  });

  it('refuses owner mode when only a different name matches position 0', () => {
    const decision = decideFromNames({
      publishingName: OWNER_NAME,
      accountAddress: 'QSomeoneElse',
      accountNames: ['qortal web builders', 'another name'],
      checkedAt: 1,
    });

    expect(decision.status).toBe('owner');

    const visitor = decideFromNames({
      publishingName: OWNER_NAME,
      accountAddress: 'QSomeoneElse',
      accountNames: ['qortal web builders site', 'another name'],
      checkedAt: 1,
    });
    expect(visitor.status).toBe('visitor');
    expect(visitor.reason).toBe('publishing-name-not-owned');
  });

  it('is order-independent and treats an empty list as a visitor', () => {
    const shuffled = decideFromNames({
      publishingName: OWNER_NAME,
      accountAddress: 'QOwner',
      accountNames: ['b name', 'z name', OWNER_NAME.toLowerCase()],
      checkedAt: 1,
    });
    const empty = decideFromNames({
      publishingName: OWNER_NAME,
      accountAddress: 'QOwner',
      accountNames: [],
      checkedAt: 1,
    });

    expect(shuffled.status).toBe('owner');
    expect(empty.status).toBe('visitor');
  });

  it('never confirms owner mode for an empty or whitespace publishing name', () => {
    for (const publishingName of ['', '   ']) {
      const decision = decideFromNames({
        publishingName,
        accountAddress: 'QOwner',
        accountNames: ['', '   '],
        checkedAt: 1,
      });
      expect(decision.status).not.toBe('owner');
    }
  });
});

describe('name list extraction', () => {
  it('reads the verified NameSummary shape', () => {
    const extracted = extractNameList([
      { name: OWNER_NAME, owner: 'QOwner' },
      { name: 'Q-Website', owner: 'QOwner' },
    ]);

    expect(extracted.names).toEqual(['qortal web builders', 'q-website']);
    expect(extracted.malformedEntries).toBe(0);
  });

  it('also accepts bare strings and counts unusable entries', () => {
    const extracted = extractNameList(['Qortal Web Builders', '', 42, null, { owner: 'x' }]);

    expect(extracted.names).toEqual(['qortal web builders']);
    expect(extracted.malformedEntries).toBe(4);
  });

  it('returns nothing for a non-array payload', () => {
    expect(extractNameList({ names: [] }).names).toEqual([]);
    expect(extractNameList(undefined).names).toEqual([]);
  });
});

describe('determineOwner', () => {
  it('confirms the owner through GET_USER_ACCOUNT + GET_ACCOUNT_NAMES', async () => {
    const seen: QortalAction[] = [];
    const decision = await determineOwner({
      app: renderApp(),
      bridge: scripted((action) => {
        seen.push(action);
        if (action === 'GET_USER_ACCOUNT')
          return Promise.resolve({ address: 'QOwner', publicKey: 'pk' });
        if (action === 'GET_ACCOUNT_NAMES') return Promise.resolve([{ name: OWNER_NAME }]);
        return Promise.reject(new Error(`unexpected ${action}`));
      }),
    });

    expect(decision.status).toBe('owner');
    expect(decision.accountAddress).toBe('QOwner');
    expect(decision.accountNames).toEqual(['qortal web builders']);
    expect(seen).toEqual(['GET_USER_ACCOUNT', 'GET_ACCOUNT_NAMES']);
  });

  it('never sends limit/offset/reverse to GET_ACCOUNT_NAMES', async () => {
    let request: QortalRequest | null = null;
    await determineOwner({
      app: renderApp(),
      bridge: scripted((action, req) => {
        if (action === 'GET_ACCOUNT_NAMES') request = req;
        return Promise.resolve(action === 'GET_USER_ACCOUNT' ? { address: 'QOwner' } : []);
      }),
    });

    const captured = request as QortalRequest | null;
    expect(captured).not.toBeNull();
    expect(Object.keys(captured ?? {}).sort()).toEqual(['action', 'address']);
  });

  it('reports a non-owner account as a definitive visitor', async () => {
    const decision = await determineOwner({
      app: renderApp(),
      bridge: scripted((action) =>
        Promise.resolve(
          action === 'GET_USER_ACCOUNT' ? { address: 'QOther' } : [{ name: 'someone else' }],
        ),
      ),
    });

    expect(decision.status).toBe('visitor');
    expect(decision.detail).toContain('does not own');
  });

  it('fails closed when there is no bridge', async () => {
    const app = readAppIdentity({ _qdnContext: 'render', _qdnName: OWNER_NAME });
    const decision = await determineOwner({ app, bridge: createBridge({}) });

    expect(decision.status).toBe('unavailable');
    expect(decision.reason).toBe('no-bridge');
  });

  it('fails closed in the gateway and dev-proxy contexts', async () => {
    const gateway = await determineOwner({
      app: renderApp({ _qdnContext: 'gateway' }),
      bridge: scripted(() => Promise.resolve({ address: 'QOwner' })),
    });
    const proxy = await determineOwner({
      app: renderApp({ _qdnContext: 'proxy', _qdnName: '' }),
      bridge: scripted(() => Promise.resolve({ address: 'QOwner' })),
    });

    expect(gateway.status).toBe('unavailable');
    expect(gateway.reason).toBe('non-interactive-context');
    expect(gateway.detail).toContain('gateway');
    expect(proxy.status).toBe('unavailable');
  });

  it('fails closed when the host did not inject a publishing name', async () => {
    const decision = await determineOwner({
      app: renderApp({ _qdnName: '' }),
      bridge: scripted(() => Promise.resolve({ address: 'QOwner' })),
    });

    expect(decision.status).toBe('unavailable');
    expect(decision.reason).toBe('empty-publishing-name');
  });

  it('does not treat a declined permission dialog as a definitive visitor', async () => {
    const decision = await determineOwner({
      app: renderApp(),
      bridge: scripted(() => Promise.reject({ error: 'User declined' })),
    });

    expect(decision.status).toBe('inconclusive');
    expect(decision.reason).toBe('host-rejected');
    expect(decision.status).not.toBe('owner');
  });

  it('does not treat a timeout as a definitive visitor', async () => {
    const decision = await determineOwner(
      { app: renderApp(), bridge: scripted(() => new Promise(() => undefined)) },
      { timeoutMs: 5 },
    );

    expect(decision.status).toBe('inconclusive');
    expect(decision.reason).toBe('timeout');
  });

  it('treats a malformed account or name list as inconclusive, never owner', async () => {
    const badAccount = await determineOwner({
      app: renderApp(),
      bridge: scripted(() => Promise.resolve({ publicKey: 'pk' })),
    });
    const badNames = await determineOwner({
      app: renderApp(),
      bridge: scripted((action) =>
        Promise.resolve(action === 'GET_USER_ACCOUNT' ? { address: 'QOwner' } : { names: [] }),
      ),
    });

    expect(badAccount.status).toBe('inconclusive');
    expect(badAccount.reason).toBe('malformed-response');
    expect(badNames.status).toBe('inconclusive');
    expect(badNames.reason).toBe('malformed-response');
  });

  it('treats a node read failure as inconclusive, not as "not the owner"', async () => {
    const decision = await determineOwner({
      app: renderApp(),
      bridge: scripted((action) =>
        action === 'GET_USER_ACCOUNT'
          ? Promise.resolve({ address: 'QOwner' })
          : Promise.reject(new Error('node unreachable')),
      ),
    });

    expect(decision.status).toBe('inconclusive');
    expect(decision.reason).toBe('transport-error');
  });

  it('persists nothing about ownership', async () => {
    await determineOwner({
      app: renderApp(),
      bridge: scripted((action) =>
        Promise.resolve(
          action === 'GET_USER_ACCOUNT' ? { address: 'QOwner' } : [{ name: OWNER_NAME }],
        ),
      ),
    });

    const stored = Object.keys(window.localStorage);
    expect(stored).toEqual([]);
    for (const key of NO_PERSISTENCE_KEYS) {
      expect(window.localStorage.getItem(key)).toBeNull();
    }
  });
});
