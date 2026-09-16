// @vitest-environment node
/**
 * The real-host bridge shape.
 *
 * Core injects `/apps/q-apps.js` as a **classic** script, so it declares
 * `qortalRequest` with `const`: a lexical global binding that is deliberately
 * **not** a property of `globalThis`. Verified live in a render context on
 * 2026-09-16 (Core `qortal-6.1.9-108bf19`): `typeof globalThis.qortalRequest` was
 * `'undefined'` while the bare identifier was a function — which is why reading
 * only the property disabled owner mode in every real host.
 *
 * A module cannot declare that binding for another module, so the test creates it
 * the same way a classic script does: `vm.runInThisContext`. That makes this a
 * reproduction of the host shape rather than a mock of the symptom.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createBridge, defaultBridgeScope, detectQortalRequest } from '../src/qortal/bridge';
import { defaultGlobalScope, readAppIdentity } from '../src/qortal/context';
import { determineOwner } from '../src/qortal/identity';

const OWNER = 'QNwV9VV82UUZmMkDZZbEMAKPpCx7otnnsi';
/** The value the live node injects for the production resource. */
const INJECTED_NAME = 'Qortal%20Web%20Builders';

interface HostGlobals {
  _qdnContext?: string;
  _qdnService?: string;
  _qdnIdentifier?: string;
  _qdnName?: string;
  [key: string]: unknown;
}

const globals = globalThis as HostGlobals;

beforeAll(async () => {
  globals._qdnContext = 'render';
  globals._qdnService = 'WEBSITE';
  globals._qdnIdentifier = 'default';
  globals._qdnName = INJECTED_NAME;
  globals.__qwbBridgeCalls = [];

  // `node` builtins have no type definitions in this project (no @types/node),
  // so the specifier stays dynamic and the shape is asserted here.
  const specifier = 'node:vm';
  const vm = (await import(/* @vite-ignore */ specifier)) as {
    runInThisContext: (code: string) => unknown;
  };

  vm.runInThisContext(`
    const qortalRequest = (request) => {
      globalThis.__qwbBridgeCalls.push(request.action);
      if (request.action === 'GET_USER_ACCOUNT') return Promise.resolve({ address: '${OWNER}' });
      if (request.action === 'GET_ACCOUNT_NAMES') {
        return Promise.resolve([
          { name: 'Qortal Web Builders', owner: '${OWNER}' },
          { name: 'Q-Website', owner: '${OWNER}' },
        ]);
      }
      return Promise.resolve({});
    };
  `);
});

afterAll(() => {
  delete globals.__qwbBridgeCalls;
  delete globals._qdnContext;
  delete globals._qdnService;
  delete globals._qdnIdentifier;
  delete globals._qdnName;
});

describe('Core-injected bridge resolution', () => {
  it('reproduces the host shape: no globalThis property, but a callable binding', () => {
    expect(globals.qortalRequest).toBeUndefined();
    expect(typeof detectQortalRequest()).toBe('function');
  });

  it('builds a usable default bridge from that binding', () => {
    const scope = defaultBridgeScope();

    expect(typeof scope.qortalRequest).toBe('function');
    expect(createBridge(scope).available).toBe(true);
    expect(createBridge().available).toBe(true);
  });

  it('reads the injected context and the decoded publishing name', () => {
    const identity = readAppIdentity(defaultGlobalScope());

    expect(identity.context).toBe('render');
    expect(identity.service).toBe('WEBSITE');
    expect(identity.identifier).toBe('default');
    expect(identity.name).toBe('Qortal Web Builders');
    expect(identity.hasBridge).toBe(true);
    expect(identity.interactive).toBe(true);
    expect(identity.ownerModeBlockedReason).toBeNull();
  });

  it('derives owner mode end-to-end in the host shape', async () => {
    const app = readAppIdentity(defaultGlobalScope());
    const bridge = createBridge(defaultBridgeScope());

    const decision = await determineOwner({ app, bridge });

    expect(decision.status).toBe('owner');
    expect(decision.reason).toBe('publishing-name-is-owned');
    expect(decision.accountAddress).toBe(OWNER);
    expect(globals.__qwbBridgeCalls).toEqual(['GET_USER_ACCOUNT', 'GET_ACCOUNT_NAMES']);
  });
});
