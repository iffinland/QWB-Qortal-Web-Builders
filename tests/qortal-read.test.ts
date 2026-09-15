/**
 * The QDN read path.
 *
 * The node is not trusted: discovery re-checks the publisher name, the service and
 * the identifier prefix on every summary, always asks for `mode: 'ALL'`, and pages
 * only within the configured budget. Payload reads normalise the three shapes the
 * shim can answer with (parsed object, JSON text, base64 text) and fail closed on
 * anything else.
 */

import { describe, expect, it } from 'vitest';

import { createBridge } from '../src/qortal/bridge';
import type { QortalRequest } from '../src/qortal/bridge';
import {
  DISCOVERY_PAGE_SIZE,
  MAX_DISCOVERY_PAGES,
  discoverByPrefix,
  fetchBase64Resource,
  fetchJsonResource,
  fetchResourceStatus,
  mapWithConcurrency,
  normalizeJsonPayload,
} from '../src/qortal/read';
import { scriptedBridge } from './support/owner';

function summary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Qortal Web Builders',
    service: 'JSON',
    identifier: 'qwb_hl_a',
    size: 100,
    created: 1,
    updated: 1,
    status: { id: 'READY' },
    ...overrides,
  };
}

describe('normalizeJsonPayload', () => {
  it('accepts an already-parsed object or array', () => {
    expect(normalizeJsonPayload({ a: 1 })).toEqual({ ok: true, value: { a: 1 } });
    expect(normalizeJsonPayload([1, 2])).toEqual({ ok: true, value: [1, 2] });
  });

  it('parses JSON text and fails closed on anything else', () => {
    expect(normalizeJsonPayload('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    const notJson = normalizeJsonPayload('not json');
    expect(notJson.ok).toBe(false);
    if (notJson.ok) return;
    expect(notJson.error.kind).toBe('malformed');
    expect(normalizeJsonPayload(42).ok).toBe(false);
    expect(normalizeJsonPayload(null).ok).toBe(false);
  });
});

describe('fetchJsonResource', () => {
  it('classifies a not-served resource as unavailable and a broken transport as transport', async () => {
    const unavailable = await fetchJsonResource(
      scriptedBridge(() => Promise.reject({ error: 'Data unavailable. Please try again later.' })),
      { service: 'JSON', name: 'n', identifier: 'i' },
    );
    expect(unavailable.ok).toBe(false);
    if (unavailable.ok) return;
    expect(unavailable.error.kind).toBe('unavailable');

    const broken = await fetchJsonResource(
      scriptedBridge(() => Promise.reject(new Error('socket closed'))),
      { service: 'JSON', name: 'n', identifier: 'i' },
    );
    expect(broken.ok).toBe(false);
    if (broken.ok) return;
    expect(broken.error.kind).toBe('transport');
  });

  it('sends the service, name and identifier to the bridge', async () => {
    const calls: QortalRequest[] = [];
    const bridge = scriptedBridge((_action, request) => {
      calls.push(request);
      return Promise.resolve({ id: 'x' });
    });
    await fetchJsonResource(bridge, { service: 'JSON', name: 'n', identifier: 'i' });
    expect(calls[0]).toEqual({
      action: 'FETCH_QDN_RESOURCE',
      service: 'JSON',
      name: 'n',
      identifier: 'i',
    });
  });
});

describe('fetchBase64Resource and fetchResourceStatus', () => {
  it('asks for base64 encoding and rejects a non-text answer', async () => {
    const calls: QortalRequest[] = [];
    const bridge = scriptedBridge((_action, request) => {
      calls.push(request);
      return Promise.resolve('AAAA');
    });
    await expect(
      fetchBase64Resource(bridge, { service: 'THUMBNAIL', name: 'n', identifier: 'i' }),
    ).resolves.toEqual({ ok: true, value: 'AAAA' });
    expect(calls[0]?.encoding).toBe('base64');

    const empty = await fetchBase64Resource(
      scriptedBridge(() => Promise.resolve({ no: 'text' })),
      { service: 'THUMBNAIL', name: 'n', identifier: 'i' },
    );
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.error.kind).toBe('malformed');
  });

  it('reads the node status object', async () => {
    const ready = await fetchResourceStatus(
      scriptedBridge(() => Promise.resolve({ status: 'READY' })),
      {
        service: 'JSON',
        name: 'n',
        identifier: 'i',
      },
    );
    expect(ready).toEqual({ ok: true, value: 'READY' });

    const noField = await fetchResourceStatus(
      scriptedBridge(() => Promise.resolve({})),
      {
        service: 'JSON',
        name: 'n',
        identifier: 'i',
      },
    );
    expect(noField.ok).toBe(false);
  });
});

describe('mapWithConcurrency', () => {
  it('preserves order and never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return item * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('handles an empty list', async () => {
    await expect(mapWithConcurrency([], 4, () => Promise.resolve(1))).resolves.toEqual([]);
  });
});

describe('discoverByPrefix', () => {
  const ref = { service: 'JSON', name: 'Qortal Web Builders', identifierPrefix: 'qwb_hl_' };

  it('always asks for all revisions of the exact publisher with a prefix match', async () => {
    const calls: QortalRequest[] = [];
    const bridge = scriptedBridge((_action, request) => {
      calls.push(request);
      return Promise.resolve([]);
    });
    await discoverByPrefix(bridge, ref);

    expect(calls[0]).toEqual({
      action: 'SEARCH_QDN_RESOURCES',
      service: 'JSON',
      identifier: 'qwb_hl_',
      prefix: true,
      names: ['Qortal Web Builders'],
      exactMatchNames: true,
      mode: 'ALL',
      includeStatus: true,
      excludeBlocked: true,
      limit: DISCOVERY_PAGE_SIZE,
      offset: 0,
      reverse: true,
    });
  });

  it('re-filters name, service and prefix because the node filter is not the authority', async () => {
    const bridge = scriptedBridge(() =>
      Promise.resolve([
        summary(),
        summary({ name: 'Someone Else', identifier: 'qwb_hl_foreign' }),
        summary({ service: 'IMAGE', identifier: 'qwb_hl_wrong-service' }),
        summary({ identifier: 'qwb_work_wrong-prefix' }),
      ]),
    );
    const result = await discoverByPrefix(bridge, ref);
    expect(result.summaries.map((entry) => entry.identifier)).toEqual(['qwb_hl_a']);
  });

  it('de-duplicates an identifier seen twice and stops at the first short page', async () => {
    // A page may repeat an identifier when a resource is updated mid-pagination.
    const pages: readonly (readonly string[])[] = [
      ['qwb_hl_a', 'qwb_hl_b'],
      ['qwb_hl_b', 'qwb_hl_c'],
      ['qwb_hl_c'],
    ];
    let page = 0;
    const bridge = scriptedBridge(() => {
      const identifiers = pages[page] ?? [];
      page += 1;
      return Promise.resolve(identifiers.map((identifier) => summary({ identifier })));
    });
    const result = await discoverByPrefix(bridge, ref, { pageSize: 2, maxPages: 5 });
    expect(result.pages).toBe(3);
    expect(result.summaries.map((entry) => entry.identifier)).toEqual([
      'qwb_hl_a',
      'qwb_hl_b',
      'qwb_hl_c',
    ]);
    expect(result.truncated).toBe(false);
  });

  it('reports truncation when the page budget is exhausted', async () => {
    const bridge = scriptedBridge((_action, request) => {
      const offset = Number(request.offset ?? 0);
      return Promise.resolve(
        Array.from({ length: Number(request.limit) }, (_, index) =>
          summary({ identifier: `qwb_hl_${String(offset + index)}` }),
        ),
      );
    });
    const result = await discoverByPrefix(bridge, ref, { pageSize: 3, maxPages: 2 });
    expect(result.pages).toBe(2);
    expect(result.summaries).toHaveLength(6);
    expect(result.truncated).toBe(true);
  });

  it('records a failed page and stops without inventing data', async () => {
    const bridge = scriptedBridge(() => Promise.reject(new Error('node down')));
    const result = await discoverByPrefix(bridge, ref);
    expect(result.answered).toBe(false);
    expect(result.summaries).toEqual([]);
    expect(result.errors.join(' ')).toContain('node down');
  });

  it('rejects a response that is not an array', async () => {
    const bridge = scriptedBridge(() => Promise.resolve({ not: 'an array' }));
    const result = await discoverByPrefix(bridge, ref);
    expect(result.summaries).toEqual([]);
    expect(result.errors.join(' ')).toContain('expected an array');
  });

  it('uses the same bounded defaults the architecture approved', async () => {
    const calls: QortalRequest[] = [];
    const bridge = scriptedBridge((_action, request) => {
      calls.push(request);
      return Promise.resolve(
        Array.from({ length: DISCOVERY_PAGE_SIZE }, (_, index) =>
          summary({ identifier: `qwb_hl_${String(index)}` }),
        ),
      );
    });
    const result = await discoverByPrefix(bridge, ref);
    expect(result.pages).toBe(MAX_DISCOVERY_PAGES);
    expect(result.truncated).toBe(true);
    expect(calls).toHaveLength(MAX_DISCOVERY_PAGES);
  });
});

describe('bridge availability', () => {
  it('answers every read with a no-bridge failure when there is no host bridge', async () => {
    const bridge = createBridge({});
    expect(bridge.available).toBe(false);
    const outcome = await bridge.request('FETCH_QDN_RESOURCE', {
      service: 'JSON',
      identifier: 'i',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe('no-bridge');
  });
});
