/**
 * Qortal platform adapter.
 *
 * Two independent halves, so that reading never needs a bridge and writing is
 * impossible without one:
 *
 *  - `QdnReader`: public, unauthenticated HTTP reads on the same origin as the
 *    app (`/arbitrary/...`, `/names/...`). Endpoint shapes follow Qortal Core's
 *    ArbitraryResource (`search` with `prefix`, `exactmatchnames`, `identifier`,
 *    fetch with `encoding=base64`) and Qortal's qapp-core usage in `usePublish`.
 *  - `QdnWriter`: publishing through the platform bridge (`qortalRequest`,
 *    action `PUBLISH_QDN_RESOURCE`, as used by qapp-core). Only the owner console
 *    holds a writer, and `content/save.ts` refuses to call it without an owner check.
 *
 * Both are interfaces so that the content layer and the tests never touch a
 * live node. The concrete implementations here are thin and are covered by mock
 * `fetch`/bridge tests; a live node was not available for this beta.
 */

/** Minimal JSON-compatible value, used for payloads crossing the adapter. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface QdnReader {
  /** Identifiers of JSON resources published under `name` whose identifier starts with `prefix`. */
  searchIdentifiers(params: {
    readonly name: string;
    readonly prefix: string;
    readonly limit: number;
  }): Promise<readonly string[]>;
  /** The decoded JSON payload, or `null` when the resource does not exist. */
  fetchJson(name: string, identifier: string): Promise<unknown>;
}

export interface PublishRequest {
  readonly name: string;
  readonly identifier: string;
  readonly title: string;
  readonly value: JsonValue;
}

export interface QdnWriter {
  /** Resolves when the platform accepted the publish; rejects otherwise. */
  publishJson(request: PublishRequest): Promise<void>;
}

/** The platform bridge: `window.qortalRequest` when the app runs inside a Qortal host. */
export interface QortalBridge {
  request(payload: Record<string, unknown>): Promise<unknown>;
}

export class QdnHttpError extends Error {
  readonly status: number;
  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'QdnHttpError';
    this.status = status;
  }
}

function hostOf(win: Window | null | undefined): unknown {
  return win === null || win === undefined
    ? undefined
    : (win as unknown as { qortalRequest?: unknown }).qortalRequest;
}

/**
 * Detects the Qortal bridge without assuming it exists (plain browsers have none).
 * A site rendered inside the Qortal host lives in an iframe, so the function may be
 * exposed on the parent or top window instead of its own. Cross-origin access can
 * throw, which is treated as "not here".
 */
export function detectBridge(scope: unknown): QortalBridge | null {
  const find = (candidate: unknown): QortalBridge | null => {
    if (typeof candidate !== 'function') return null;
    const request = candidate as (payload: Record<string, unknown>) => Promise<unknown>;
    return { request: (payload) => request(payload) };
  };
  if (typeof scope !== 'object' || scope === null) return null;
  const own = find((scope as { readonly qortalRequest?: unknown }).qortalRequest);
  if (own !== null) return own;
  if (typeof window !== 'undefined') {
    try {
      const parentBridge = find(hostOf(window.parent));
      if (parentBridge !== null && window.parent !== window) return parentBridge;
    } catch {
      // Cross-origin parent: continue with the top window.
    }
    try {
      const topBridge = find(hostOf(window.top));
      if (topBridge !== null && window.top !== window) return topBridge;
    } catch {
      // Cross-origin top: no bridge.
    }
  }
  return null;
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  // Chunked to avoid argument-count limits on large payloads.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function base64ToUtf8(encoded: string): string {
  const binary = atob(encoded.trim());
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Creates the public reader. `baseUrl` is empty in production (same origin). */
export function createHttpReader(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  baseUrl = '',
): QdnReader {
  const get = async (url: string): Promise<Response> => {
    const response = await fetchImpl(`${baseUrl}${url}`, {
      headers: { Accept: 'application/json' },
    });
    return response;
  };

  return {
    async searchIdentifiers({ name, prefix, limit }) {
      const query = new URLSearchParams({
        mode: 'ALL',
        service: 'JSON',
        name,
        exactmatchnames: 'true',
        prefix: 'true',
        identifier: prefix,
        includemetadata: 'false',
        limit: String(limit),
        offset: '0',
        reverse: 'true',
        excludeblocked: 'true',
      });
      const url = `/arbitrary/resources/search?${query.toString()}`;
      const response = await get(url);
      if (!response.ok) throw new QdnHttpError(response.status, url);
      const body: unknown = await response.json();
      if (!Array.isArray(body)) throw new Error('search response is not an array');
      const items: readonly unknown[] = body;
      const identifiers: string[] = [];
      for (const item of items) {
        if (typeof item === 'object' && item !== null && 'identifier' in item) {
          const identifier = item.identifier;
          if (typeof identifier === 'string' && identifier.startsWith(prefix))
            identifiers.push(identifier);
        }
      }
      return [...new Set(identifiers)];
    },

    async fetchJson(name, identifier) {
      const url = `/arbitrary/JSON/${encodeURIComponent(name)}/${encodeURIComponent(identifier)}?encoding=base64`;
      const response = await get(url);
      if (response.status === 404) return null;
      if (!response.ok) throw new QdnHttpError(response.status, url);
      const encoded = await response.text();
      return JSON.parse(base64ToUtf8(encoded)) as unknown;
    },
  };
}

/** Looks up the owner of a registered Qortal name (`/names/{name}`). Null when unregistered. */
export async function fetchNameOwner(
  name: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  baseUrl = '',
): Promise<string | null> {
  const url = `/names/${encodeURIComponent(name)}`;
  const response = await fetchImpl(`${baseUrl}${url}`, { headers: { Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new QdnHttpError(response.status, url);
  const body: unknown = await response.json();
  if (typeof body === 'object' && body !== null && 'owner' in body) {
    const owner = body.owner;
    return typeof owner === 'string' ? owner : null;
  }
  return null;
}

/** Writer that publishes through the platform bridge (owner console only). */
export function createBridgeWriter(bridge: QortalBridge): QdnWriter {
  return {
    async publishJson({ name, identifier, title, value }) {
      const response = await bridge.request({
        action: 'PUBLISH_QDN_RESOURCE',
        name,
        service: 'JSON',
        identifier,
        title,
        data64: utf8ToBase64(JSON.stringify(value)),
      });
      // qapp-core treats a response carrying a transaction signature as an accepted publish.
      const accepted =
        typeof response === 'object' &&
        response !== null &&
        'signature' in response &&
        typeof response.signature === 'string';
      if (!accepted) throw new Error('the platform did not confirm the publish');
    },
  };
}
