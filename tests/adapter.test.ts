import { describe, expect, it, vi } from 'vitest';

import {
  base64ToUtf8,
  createBridgeWriter,
  createHttpReader,
  detectBridge,
  fetchNameOwner,
} from '../src/qortal/adapter';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('public HTTP reader', () => {
  it('searches JSON resources by exact name and identifier prefix', async () => {
    const fetchSpy = vi.fn<(input: string) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse([{ identifier: 'qwb_site_v1' }, { identifier: 'qwb_svc_a-1' }])),
    );
    const reader = createHttpReader(fetchSpy as unknown as typeof fetch);
    const ids = await reader.searchIdentifiers({
      name: 'Qortal Web Builders',
      prefix: 'qwb_',
      limit: 50,
    });
    expect(ids).toEqual(['qwb_site_v1', 'qwb_svc_a-1']);
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain('/arbitrary/resources/search?');
    expect(url).toContain('service=JSON');
    expect(url).toContain('name=Qortal+Web+Builders');
    expect(url).toContain('exactmatchnames=true');
    expect(url).toContain('prefix=true');
    expect(url).toContain('identifier=qwb_');
  });

  it('throws on a failed search instead of returning an empty list', async () => {
    const reader = createHttpReader(() => Promise.resolve(new Response('no', { status: 500 })));
    await expect(reader.searchIdentifiers({ name: 'n', prefix: 'qwb_', limit: 1 })).rejects.toThrow(
      'HTTP 500',
    );
  });

  it('decodes base64 JSON payloads and returns null for a missing resource', async () => {
    const payload = { id: 'qwb_site_v1', title: 'Čeština ✓' };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const fetchSpy = vi.fn((url: string) =>
      Promise.resolve(
        url.includes('missing')
          ? new Response('', { status: 404 })
          : new Response(encoded, { status: 200 }),
      ),
    );
    const reader = createHttpReader(fetchSpy as unknown as typeof fetch);
    await expect(reader.fetchJson('Qortal Web Builders', 'qwb_site_v1')).resolves.toEqual(payload);
    await expect(reader.fetchJson('Qortal Web Builders', 'missing')).resolves.toBeNull();
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('encoding=base64');
  });

  it('decodes UTF-8 base64 exactly', () => {
    expect(base64ToUtf8(btoa(unescape(encodeURIComponent('hei ä'))))).toBe('hei ä');
  });

  it('looks up the owner address of a registered name, or null when unregistered', async () => {
    const owned = vi.fn(() => Promise.resolve(jsonResponse({ owner: 'QOWNER' })));
    await expect(fetchNameOwner('owner', owned as unknown as typeof fetch)).resolves.toBe('QOWNER');
    const missing = vi.fn(() => Promise.resolve(new Response('', { status: 404 })));
    await expect(fetchNameOwner('nobody', missing as unknown as typeof fetch)).resolves.toBeNull();
  });
});

describe('platform bridge', () => {
  it('detects the bridge only when qortalRequest is a function', () => {
    expect(detectBridge({})).toBeNull();
    expect(detectBridge({ qortalRequest: 'nope' })).toBeNull();
    expect(detectBridge(null)).toBeNull();
    expect(detectBridge({ qortalRequest: () => Promise.resolve({}) })).not.toBeNull();
  });

  it('publishes JSON through PUBLISH_QDN_RESOURCE with base64 data', async () => {
    const request = vi.fn<(payload: Record<string, unknown>) => Promise<unknown>>(() =>
      Promise.resolve({ signature: 'sig' }),
    );
    const writer = createBridgeWriter({ request });
    await writer.publishJson({
      name: 'Qortal Web Builders',
      identifier: 'qwb_svc_a-1',
      title: 'A',
      value: { a: 1 },
    });
    const payload = request.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      action: 'PUBLISH_QDN_RESOURCE',
      service: 'JSON',
      identifier: 'qwb_svc_a-1',
    });
    expect(base64ToUtf8(String(payload.data64))).toBe('{"a":1}');
  });

  it('treats a publish without a transaction signature as not accepted', async () => {
    const writer = createBridgeWriter({ request: () => Promise.resolve({}) });
    await expect(
      writer.publishJson({ name: 'n', identifier: 'qwb_svc_a-1', title: 'A', value: {} }),
    ).rejects.toThrow('did not confirm');
  });

  it('publishes a selected file as base64 media', async () => {
    const request = vi.fn<(payload: Record<string, unknown>) => Promise<unknown>>(() =>
      Promise.resolve({ signature: 'media-sig' }),
    );
    const writer = createBridgeWriter({ request });
    const file = {
      name: 'cover.png',
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode('image bytes').buffer),
    } as File;
    await writer.publishFile?.({
      name: 'Owner',
      service: 'IMAGE',
      identifier: 'qwb_work_cover_1',
      title: 'Cover',
      file,
    });
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      action: 'PUBLISH_QDN_RESOURCE',
      service: 'IMAGE',
      filename: 'cover.png',
      encoding: 'base64',
    });
    expect(atob(String(request.mock.calls[0]?.[0].data64))).toBe('image bytes');
  });
});
