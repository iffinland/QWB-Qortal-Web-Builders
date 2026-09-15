import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOwnerSession } from '../src/owner/session';
import { readAppIdentity } from '../src/qortal/context';
import type { BridgeOutcome, QortalBridge } from '../src/qortal/bridge';
import {
  bridgeForAccount,
  identityFrom,
  sessionFor,
  settle,
  RENDER_OWNER_SCOPE,
} from './support/owner';

const OWNER_NAME = 'Qortal Web Builders';

function ownerIdentity() {
  return identityFrom(RENDER_OWNER_SCOPE);
}

function visitorIdentity() {
  return readAppIdentity({
    _qdnContext: 'render',
    _qdnService: 'WEBSITE',
    _qdnName: 'Some Other App',
    qortalRequest: () => Promise.resolve({}),
  });
}

describe('owner session', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts unchecked and derives owner mode on start()', async () => {
    const session = sessionFor({
      app: ownerIdentity(),
      bridge: bridgeForAccount({ address: 'QOwner', names: [{ name: OWNER_NAME }] }),
    });

    expect(session.state.status).toBe('inconclusive');
    expect(session.state.lastCheckedAt).toBeNull();

    session.start();
    await settle();

    expect(session.state.status).toBe('owner');
    expect(session.state.publishingName).toBe(OWNER_NAME);
    expect(session.state.writeEnabled).toBe(false);
    session.stop();
  });

  it('keeps a visitor out and never persists the decision', async () => {
    const session = sessionFor({
      app: visitorIdentity(),
      bridge: bridgeForAccount({ address: 'QOther', names: [{ name: 'someone else' }] }),
    });

    await session.reverify('boot');
    await session.reverify('action');

    expect(session.state.status).toBe('visitor');
    expect(window.localStorage.length).toBe(0);
    expect(JSON.stringify(session.state)).not.toContain('owner=true');
  });

  it('re-verifies on an account switch and refuses privileged actions', async () => {
    // The host emits no account-changed event, so this bridge changes what the
    // account owns behind the session's back.
    let ownedNames: readonly { readonly name: string }[] = [{ name: OWNER_NAME }];
    const switching: QortalBridge = {
      available: true,
      describe: 'scripted account switch',
      request: <T>(action: string): Promise<BridgeOutcome<T>> => {
        const value: unknown = action === 'GET_USER_ACCOUNT' ? { address: 'QOwner' } : ownedNames;
        return Promise.resolve({ ok: true as const, value: value as T });
      },
    };
    const session = sessionFor({ app: ownerIdentity(), bridge: switching });

    expect(await session.reverify('boot')).toEqual(expect.objectContaining({ status: 'owner' }));
    expect(await session.assertOwner()).toBe(true);

    // The owner switches accounts in the host: the privileged action re-check is
    // the only thing that can catch it.
    ownedNames = [{ name: 'a different name' }];

    expect(await session.assertOwner()).toBe(false);
    expect(session.state.status).toBe('visitor');
  });

  it('re-verifies when the document becomes visible again', async () => {
    vi.useFakeTimers();
    let clockNow = 1_000_000;
    const session = createOwnerSession({
      app: ownerIdentity(),
      bridge: bridgeForAccount({ address: 'QOwner', names: [{ name: OWNER_NAME }] }),
      now: () => clockNow,
      autoReverifyMinIntervalMs: 15_000,
    });
    const reverify = vi.spyOn(session, 'reverify');

    session.start();
    await vi.advanceTimersByTimeAsync(0);
    reverify.mockClear();

    // Alt-tabbing away and back is the only "the account may have changed"
    // signal the host gives us; it must re-derive the decision.
    clockNow += 20_000;
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(reverify).toHaveBeenCalledWith('visibility');
    visibility.mockRestore();
    session.stop();
  });

  it('does not re-check on route change once the answer is definitive', async () => {
    const session = sessionFor({
      app: ownerIdentity(),
      bridge: bridgeForAccount({ address: 'QOwner', names: [{ name: OWNER_NAME }] }),
    });
    await session.reverify('boot');
    const reverify = vi.spyOn(session, 'reverify');

    session.maybeReverify('route-change');

    expect(reverify).not.toHaveBeenCalled();
  });

  it('re-checks on route change while the last attempt was inconclusive', async () => {
    const failing: QortalBridge = {
      available: true,
      describe: 'always fails',
      request: <T>(): Promise<BridgeOutcome<T>> =>
        Promise.resolve({
          ok: false,
          error: {
            kind: 'transport-error',
            action: 'GET_USER_ACCOUNT',
            message: 'nope',
            hostMediated: true,
          },
        }),
    };
    const session = sessionFor({
      app: ownerIdentity(),
      bridge: failing,
      autoReverifyMinIntervalMs: 0,
    });
    expect((await session.reverify('boot')).status).toBe('inconclusive');
    const reverify = vi.spyOn(session, 'reverify');

    session.maybeReverify('route-change');

    expect(reverify).toHaveBeenCalledWith('route-change');
    await session.reverify('route-change');
  });

  it('rate-limits automatic re-checks so a visitor is not prompted in a loop', async () => {
    let clockNow = 1_000_000;
    const session = createOwnerSession({
      app: ownerIdentity(),
      bridge: bridgeForAccount({ address: 'QOwner', names: [{ name: OWNER_NAME }] }),
      now: () => clockNow,
      autoReverifyMinIntervalMs: 60_000,
    });
    const reverify = vi.spyOn(session, 'reverify');

    await session.reverify('boot');
    reverify.mockClear();

    session.maybeReverify('visibility');
    session.maybeReverify('visibility');
    expect(reverify).not.toHaveBeenCalled();

    clockNow += 60_001;
    session.maybeReverify('visibility');
    expect(reverify).toHaveBeenCalledTimes(1);
    await session.reverify('visibility');
  });

  it('deduplicates concurrent re-verifications into one pair of bridge calls', async () => {
    const actions: string[] = [];
    const session = createOwnerSession({
      app: ownerIdentity(),
      bridge: {
        available: true,
        describe: 'counting',
        request: <T>(action: string): Promise<{ ok: true; value: T }> => {
          actions.push(action);
          const value: unknown =
            action === 'GET_USER_ACCOUNT' ? { address: 'QOwner' } : [{ name: OWNER_NAME }];
          return Promise.resolve({ ok: true as const, value: value as T });
        },
      },
    });

    const [first, second] = await Promise.all([
      session.reverify('boot'),
      session.reverify('action'),
    ]);

    expect(actions).toEqual(['GET_USER_ACCOUNT', 'GET_ACCOUNT_NAMES']);
    expect(first.status).toBe('owner');
    expect(second.status).toBe('owner');
  });

  it('reports unavailable status without touching the bridge', async () => {
    let calls = 0;
    const session = createOwnerSession({
      app: readAppIdentity({ _qdnContext: 'proxy', _qdnName: '' }),
      bridge: {
        available: true,
        describe: 'counting',
        request: <T>(): Promise<{ ok: true; value: T }> => {
          calls += 1;
          return Promise.resolve({ ok: true as const, value: null as unknown as T });
        },
      },
    });

    const decision = await session.reverify('boot');

    expect(decision.status).toBe('unavailable');
    expect(calls).toBe(0);
  });

  it('notifies subscribers with the previous state', async () => {
    const session = sessionFor({
      app: ownerIdentity(),
      bridge: bridgeForAccount({ address: 'QOwner', names: [{ name: OWNER_NAME }] }),
    });
    const seen: string[] = [];
    session.subscribe((state, previous) => {
      seen.push(`${previous.status}->${state.status}`);
    });

    await session.reverify('boot');

    expect(seen).toContain('inconclusive->owner');
  });
});
