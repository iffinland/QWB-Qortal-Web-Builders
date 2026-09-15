import { afterEach, describe, expect, it, vi } from 'vitest';

import type { QortalRequest } from '../src/qortal/bridge';
import {
  classifyRejection,
  createBridge,
  defaultTimeoutFor,
  rejectionMessage,
} from '../src/qortal/bridge';

function bridgeReturning(value: unknown) {
  return createBridge({ qortalRequest: () => Promise.resolve(value) });
}

function bridgeRejecting(value: unknown) {
  // The host rejects with a plain object/string, not always an Error.
  return createBridge({ qortalRequest: () => Promise.reject(value) });
}

describe('bridge wrapper', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports an unavailable bridge instead of throwing', async () => {
    const bridge = createBridge({});
    const outcome = await bridge.request('GET_ACCOUNT_NAMES', { address: 'QAddr' });

    expect(bridge.available).toBe(false);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe('no-bridge');
    expect(outcome.error.action).toBe('GET_ACCOUNT_NAMES');
  });

  it('passes the action and payload through and returns the parsed result', async () => {
    const calls: unknown[] = [];
    const bridge = createBridge({
      qortalRequest: (request: QortalRequest) => {
        calls.push(request);
        return Promise.resolve([{ name: 'Qortal Web Builders' }]);
      },
    });

    const outcome = await bridge.request<unknown>('GET_ACCOUNT_NAMES', { address: 'QAddr' });

    expect(calls).toEqual([{ action: 'GET_ACCOUNT_NAMES', address: 'QAddr' }]);
    expect(outcome).toEqual({ ok: true, value: [{ name: 'Qortal Web Builders' }] });
  });

  it('treats a resolved `{error}` as a failure (gateway shim shape)', async () => {
    const bridge = bridgeReturning({
      error:
        'Interactive features were requested, but these are not yet supported when viewing via a gateway.',
    });

    const outcome = await bridge.request('GET_USER_ACCOUNT');

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe('host-rejected');
  });

  it('classifies a rejected host permission dialog as host-rejected', () => {
    const failure = classifyRejection('GET_USER_ACCOUNT', { error: 'User declined' });

    expect(failure.kind).toBe('host-rejected');
    expect(failure.hostMediated).toBe(true);
    expect(failure.action).toBe('GET_USER_ACCOUNT');
  });

  it('classifies the bridge timeout string as a timeout', () => {
    expect(classifyRejection('PUBLISH_QDN_RESOURCE', 'The request timed out').kind).toBe('timeout');
  });

  it('classifies an unrelated failure as a transport error', () => {
    expect(classifyRejection('GET_ACCOUNT_NAMES', new Error('fetch failed')).kind).toBe(
      'transport-error',
    );
  });

  it('reads a readable message from every rejection shape', () => {
    expect(rejectionMessage('plain')).toBe('plain');
    expect(rejectionMessage(new Error('boom'))).toBe('boom');
    expect(rejectionMessage({ error: 'nested' })).toBe('nested');
    expect(rejectionMessage({ error: { code: 7 } })).toBe('{"code":7}');
    expect(rejectionMessage(undefined)).toBe('no error detail');
  });

  it('rejects an empty answer as malformed instead of returning undefined', async () => {
    const outcome = await bridgeReturning(null).request('GET_USER_ACCOUNT');

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe('malformed-response');
  });

  it('times out with its own budget and never retries', async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const bridge = createBridge({
      qortalRequest: () => {
        calls.push(Date.now());
        return new Promise(() => undefined);
      },
    });

    const pending = bridge.request('GET_ACCOUNT_NAMES', { address: 'QAddr' }, { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(60);
    const outcome = await pending;

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe('timeout');
    expect(calls).toHaveLength(1);
  });

  it('gives GET_USER_ACCOUNT the long host-permission budget', () => {
    expect(defaultTimeoutFor('GET_USER_ACCOUNT')).toBe(60 * 60 * 1000);
    expect(defaultTimeoutFor('GET_ACCOUNT_NAMES')).toBe(30_000);
  });

  it('rejects with an unexpected value without leaking it into the message', async () => {
    const bridge = createBridge({
      qortalRequest: () => Promise.reject({ error: { secret: 'not-for-ui' } }),
    });

    const outcome = await bridge.request('GET_ACCOUNT_NAMES');

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.message).toBe('{"secret":"not-for-ui"}');
    expect(outcome.error.kind).toBe('transport-error');
  });

  it('handles a non-Error rejection from a misbehaving host', async () => {
    const bridge = createBridge({ qortalRequest: () => Promise.reject(undefined) });
    const outcome = await bridge.request('GET_ACCOUNT_NAMES');

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.message).toBe('no error detail');
  });
});

describe('bridge rejection helpers', () => {
  it('ignores an explicitly false or null embedded error', async () => {
    const withFalse = await bridgeReturning({ error: false, address: 'QAddr' }).request<unknown>(
      'GET_USER_ACCOUNT',
    );
    const withNull = await bridgeReturning({ error: null, address: 'QAddr' }).request<unknown>(
      'GET_USER_ACCOUNT',
    );

    expect(withFalse.ok).toBe(true);
    expect(withNull.ok).toBe(true);
  });

  it('surfaces a rejecting host as host-rejected when it declines', async () => {
    const bridge = bridgeRejecting({ error: 'Request declined by the user' });
    const outcome = await bridge.request('PUBLISH_QDN_RESOURCE');

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe('host-rejected');
  });
});
