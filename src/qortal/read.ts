/**
 * The QDN read path: bounded discovery + payload fetch.
 *
 * Contract verified against Core `108bf191` `src/main/resources/q-apps/q-apps.js`
 * and `org.qortal.api.resource.ArbitraryResource` / `HSQLDBArbitraryRepository`:
 *
 *  - `SEARCH_QDN_RESOURCES` request fields are camelCase and translated to the
 *    node's lowercase REST names by the shim. Passing the node's own names to the
 *    bridge silently produces an unfiltered query, so only the camelCase form is
 *    used here.
 *  - `identifier` matches anywhere in the identifier unless `prefix: true`.
 *  - `mode` defaults to `LATEST`, which in the node SQL keeps only the newest
 *    `created_when` row **per (name, service)** — with more than one entity per
 *    kind that would hide all but one of them. Discovery therefore always sends
 *    `mode: 'ALL'`.
 *  - `names` + `exactMatchNames: true` is the node's exact-name filter
 *    (`LCASE(name) IN (…)`); a bare `names` entry with `prefix: true` would match
 *    by prefix, so the exact flag is mandatory for publisher filtering.
 *  - The response is an array of summaries carrying `name`, `service`,
 *    `identifier`, `size`, `created`, `updated`, `latestSignature` and — with
 *    `includeStatus` — a `status` object.
 *
 * Everything returned by the node is treated as untrusted: the name, service and
 * identifier prefix are re-checked here, because the node filter is a convenience
 * and never the authority (audit §7).
 *
 * Payload normalization follows the verified transport boundary rule
 * (`skills/qortal/bridge-fetch-qdn-resource-normalization`): the shim JSON-parses
 * the response, so a JSON resource arrives as an object, a text/binary read as a
 * string, and anything else fails closed before a validator sees it.
 */

import type { QortalBridge } from './bridge';

/** One node search page. The approved discovery budget is a few pages per kind. */
export const DISCOVERY_PAGE_SIZE = 50;
export const MAX_DISCOVERY_PAGES = 3;
/** Bounded payload hydration: keeps the frame responsive on a slow node. */
export const FETCH_CONCURRENCY = 4;

export interface QdnResourceRef {
  readonly service: string;
  readonly name: string;
  readonly identifier: string;
}

export interface QdnResourceSummary extends QdnResourceRef {
  readonly size: number | null;
  readonly created: number | null;
  readonly updated: number | null;
  /** `status.id` from `includeStatus`, e.g. READY / DOWNLOADING / MISSING_DATA. */
  readonly status: string | null;
}

export interface DiscoveryResult {
  readonly summaries: readonly QdnResourceSummary[];
  readonly pages: number;
  /** A further page exists beyond the configured budget. */
  readonly truncated: boolean;
  /** `true` when at least the first page was answered by the node. */
  readonly answered: boolean;
  readonly errors: readonly string[];
}

export type ReadFailureKind = 'unavailable' | 'transport' | 'malformed';

export interface ReadFailure {
  readonly kind: ReadFailureKind;
  readonly message: string;
}

export type ReadOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ReadFailure };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The wordings the node uses for "this resource is not served by me". Verified
 * live, a missing resource answers
 * `{"error":1401,"message":"Couldn't find PUT transaction for name …"}`; the
 * status endpoint answers `NOT_PUBLISHED`, and other paths use "Data unavailable".
 * Getting this wrong is not cosmetic: "not served" is what lets the read path tell
 * an empty publisher (the designed pre-publication state) apart from a broken read.
 */
const UNAVAILABLE_PATTERN =
  /data unavailable|not published|not_published|does not exist|couldn'?t find|no such (resource|name)|not found|\b1401\b|\b404\b|missing data/i;

function classifyReadError(message: string): ReadFailureKind {
  return UNAVAILABLE_PATTERN.test(message) ? 'unavailable' : 'transport';
}

function normalizeSummary(value: unknown): QdnResourceSummary | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name);
  const service = readString(value.service);
  const identifier = readString(value.identifier);
  if (name === null || service === null || identifier === null) return null;

  const status = isRecord(value.status) ? readString(value.status.id) : null;

  return {
    name,
    service,
    identifier,
    size: readNumber(value.size),
    created: readNumber(value.created),
    updated: readNumber(value.updated),
    status,
  };
}

/**
 * One bounded, prefix-filtered discovery for a single entity kind.
 *
 * Pages until a short page is returned or `maxPages` is reached, keeps a stable
 * newest-first order, and de-duplicates by identifier (a node may answer the same
 * identifier twice across pages if a resource is updated mid-pagination).
 */
export async function discoverByPrefix(
  bridge: QortalBridge,
  request: { readonly service: string; readonly name: string; readonly identifierPrefix: string },
  options: { readonly pageSize?: number; readonly maxPages?: number } = {},
): Promise<DiscoveryResult> {
  const pageSize = options.pageSize ?? DISCOVERY_PAGE_SIZE;
  const maxPages = options.maxPages ?? MAX_DISCOVERY_PAGES;
  const errors: string[] = [];
  const summaries: QdnResourceSummary[] = [];
  const seen = new Set<string>();
  let answered = false;
  let truncated = false;
  let pages = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const outcome = await bridge.request<unknown>('SEARCH_QDN_RESOURCES', {
      service: request.service,
      identifier: request.identifierPrefix,
      prefix: true,
      names: [request.name],
      exactMatchNames: true,
      mode: 'ALL',
      includeStatus: true,
      excludeBlocked: true,
      limit: pageSize,
      offset: page * pageSize,
      reverse: true,
    });

    if (!outcome.ok) {
      errors.push(`search ${request.service} page ${String(page + 1)}: ${outcome.error.message}`);
      break;
    }
    if (!Array.isArray(outcome.value)) {
      errors.push(`search ${request.service} page ${String(page + 1)}: expected an array`);
      break;
    }

    answered = true;
    pages += 1;

    for (const entry of outcome.value) {
      const summary = normalizeSummary(entry);
      // Exact publisher/service/prefix filtering: the node filter is not trusted.
      if (summary === null) continue;
      if (summary.name !== request.name) continue;
      if (summary.service !== request.service) continue;
      if (!summary.identifier.startsWith(request.identifierPrefix)) continue;
      if (seen.has(summary.identifier)) continue;
      seen.add(summary.identifier);
      summaries.push(summary);
    }

    if (outcome.value.length < pageSize) return { summaries, pages, truncated, answered, errors };
    if (page === maxPages - 1) truncated = true;
  }

  return { summaries, pages, truncated, answered, errors };
}

/**
 * Normalizes one `FETCH_QDN_RESOURCE` result.
 *
 * The shim JSON-parses the response when possible, so a JSON entity arrives as an
 * object; a text resource arrives as a string; a base64 read as a base64 string.
 * Numbers, booleans and nulls are not payloads and fail closed.
 */
export function normalizeJsonPayload(raw: unknown): ReadOutcome<unknown> {
  if (isRecord(raw) || Array.isArray(raw)) return { ok: true, value: raw };

  if (typeof raw === 'string') {
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return {
        ok: false,
        error: { kind: 'malformed', message: 'the resource did not contain valid JSON' },
      };
    }
  }

  return {
    ok: false,
    error: {
      kind: 'malformed',
      message: `expected a JSON object or text, received ${raw === null ? 'null' : typeof raw}`,
    },
  };
}

/** Fetches and normalizes one JSON resource. */
export async function fetchJsonResource(
  bridge: QortalBridge,
  ref: QdnResourceRef,
): Promise<ReadOutcome<unknown>> {
  const outcome = await bridge.request<unknown>(
    'FETCH_QDN_RESOURCE',
    { service: ref.service, name: ref.name, identifier: ref.identifier },
    { timeoutMs: 60_000 },
  );

  if (!outcome.ok) {
    return {
      ok: false,
      error: { kind: classifyReadError(outcome.error.message), message: outcome.error.message },
    };
  }

  return normalizeJsonPayload(outcome.value);
}

/** Reads a resource as base64 (`encoding: 'base64'`) — used to verify media bytes. */
export async function fetchBase64Resource(
  bridge: QortalBridge,
  ref: QdnResourceRef,
): Promise<ReadOutcome<string>> {
  const outcome = await bridge.request<unknown>(
    'FETCH_QDN_RESOURCE',
    { service: ref.service, name: ref.name, identifier: ref.identifier, encoding: 'base64' },
    { timeoutMs: 60_000 },
  );

  if (!outcome.ok) {
    return {
      ok: false,
      error: { kind: classifyReadError(outcome.error.message), message: outcome.error.message },
    };
  }
  if (typeof outcome.value !== 'string' || outcome.value.trim() === '') {
    return {
      ok: false,
      error: { kind: 'malformed', message: 'the resource did not return base64 text' },
    };
  }
  return { ok: true, value: outcome.value.trim() };
}

/** Node-local availability of one resource (`GET_QDN_RESOURCE_STATUS`). */
export async function fetchResourceStatus(
  bridge: QortalBridge,
  ref: QdnResourceRef,
): Promise<ReadOutcome<string>> {
  const outcome = await bridge.request<unknown>('GET_QDN_RESOURCE_STATUS', {
    service: ref.service,
    name: ref.name,
    identifier: ref.identifier,
  });

  if (!outcome.ok) {
    return {
      ok: false,
      error: { kind: classifyReadError(outcome.error.message), message: outcome.error.message },
    };
  }
  if (!isRecord(outcome.value)) {
    return { ok: false, error: { kind: 'malformed', message: 'expected a status object' } };
  }
  const status = readString(outcome.value.status) ?? readString(outcome.value.id);
  if (status === null) {
    return { ok: false, error: { kind: 'malformed', message: 'the status had no status field' } };
  }
  return { ok: true, value: status };
}

/**
 * Runs a bounded number of async jobs at once. Fetching payloads serially would
 * be slow on a real node; unbounded parallelism would flood the frame.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<readonly R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      const item = items[index];
      if (index >= items.length || item === undefined) return;
      results[index] = await run(item, index);
    }
  });

  await Promise.all(workers);
  return results;
}
