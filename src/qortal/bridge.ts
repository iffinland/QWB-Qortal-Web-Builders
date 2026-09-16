/**
 * The single Qortal bridge wrapper.
 *
 * Every bridge call in the app goes through `createBridge()`. It normalises the
 * three shapes a call can end in — resolved value, rejected value, timeout —
 * into one `BridgeOutcome`, so no caller has to guess. Nothing else in the app
 * touches `window.qortalRequest`.
 *
 * Verified against Core `108bf191` `src/main/resources/q-apps/q-apps.js`:
 *  - `qortalRequest(request)` resolves with the parsed response object and
 *    **rejects** with the host's error object (`{error: {...}}`) or the string
 *    `"The request timed out"`;
 *  - `GET_USER_ACCOUNT` has a 60-minute default timeout because the host
 *    permission dialog waits for the user;
 *  - public node reads (`GET_ACCOUNT_NAMES`, `SEARCH_QDN_RESOURCES`,
 *    `FETCH_QDN_RESOURCE`, …) are answered by `q-apps.js` itself;
 *  - `GET_ACCOUNT_NAMES` ignores `limit`/`offset`/`reverse`: the response is the
 *    complete name list for that address.
 *
 * Verified against Core `108bf191` `src/main/resources/q-apps/q-apps-gateway.js`:
 * in gateway context interactive actions are answered with
 * `{"error": "Interactive features were requested, but these are not yet
 * supported when viewing via a gateway…"}`. The source shows that arriving as a
 * rejection, but a resolved `{error}` object is treated as a failure too, so the
 * classifier is correct either way.
 *
 * Retry policy (audit §1 class table): public/idempotent reads may be retried in
 * a bounded way; host-mediated permissioned reads and signed writes must never
 * be retried automatically. `BridgeFailure.hostMediated` carries that fact to
 * callers instead of leaving it to memory.
 */

export type QortalAction =
  | 'GET_USER_ACCOUNT'
  | 'GET_ACCOUNT_NAMES'
  | 'GET_NAME_DATA'
  | 'SEARCH_QDN_RESOURCES'
  | 'FETCH_QDN_RESOURCE'
  | 'GET_QDN_RESOURCE_STATUS'
  | 'GET_QDN_RESOURCE_URL'
  | 'PUBLISH_QDN_RESOURCE'
  | 'PUBLISH_MULTIPLE_QDN_RESOURCES';

export interface QortalRequest {
  readonly action: string;
  readonly [key: string]: unknown;
}

export type QortalRequestFn = (request: QortalRequest) => Promise<unknown>;

export interface BridgeScope {
  readonly qortalRequest?: unknown;
}

export type BridgeFailureKind =
  'no-bridge' | 'host-rejected' | 'timeout' | 'malformed-response' | 'transport-error';

export interface BridgeFailure {
  readonly kind: BridgeFailureKind;
  readonly action: string;
  /** Human-readable, safe to show: never contains secrets. */
  readonly message: string;
  /** `true` for permissioned reads and signed writes: no automatic retry. */
  readonly hostMediated: boolean;
}

export type BridgeOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: BridgeFailure };

export interface BridgeRequestOptions {
  /** Overrides the per-action default. */
  readonly timeoutMs?: number;
}

export interface QortalBridge {
  readonly available: boolean;
  /** The function `createBridge` captured, when one exists. */
  readonly describe: string;
  request<T>(
    action: QortalAction,
    payload?: Readonly<Record<string, unknown>>,
    options?: BridgeRequestOptions,
  ): Promise<BridgeOutcome<T>>;
}

/** Default per-action budgets from Core's `getDefaultTimeout`. */
export const DEFAULT_TIMEOUT_MS = 30_000;
/** `GET_USER_ACCOUNT` waits on a host permission dialog. */
export const USER_ACCOUNT_TIMEOUT_MS = 60 * 60 * 1000;

const HOST_MEDIATED_ACTIONS: readonly QortalAction[] = [
  'GET_USER_ACCOUNT',
  'PUBLISH_QDN_RESOURCE',
  'PUBLISH_MULTIPLE_QDN_RESOURCES',
];

const GATEWAY_REJECTION_PATTERN = /gateway|interactive features|not yet supported/i;
const REJECTION_PATTERN = /denied|declined|cancel|reject|refused/i;
const TIMEOUT_PATTERN = /timed out|timeout/i;

class BridgeTimeoutError extends Error {
  public constructor(action: string, timeoutMs: number) {
    super(`${action} did not answer within ${String(timeoutMs)} ms`);
    this.name = 'BridgeTimeoutError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * The bridge rejects with a plain object (`{error: …}`), a string, or an
 * `Error`. This collapses all three into a readable message.
 *
 * The node's own error bodies carry the readable part in `message` and a numeric
 * code in `error` (verified live: a missing resource answers
 * `{"error":1401,"message":"Couldn't find PUT transaction for name …"}`). Keeping
 * both matters: the code is what callers classify on, and the message is what a
 * human can act on. A resolved `{error}` object is treated exactly the same way,
 * because the shim answers HTTP errors as a *resolved* parsed body.
 */
export function rejectionMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (isRecord(value)) {
    const detail =
      typeof value.message === 'string' && value.message.trim() !== '' ? value.message : null;
    const error = value.error;
    if (typeof error === 'string') return detail === null ? error : `${error} (${detail})`;
    if (error !== undefined)
      return detail === null ? safeJson(error) : `${safeJson(error)} (${detail})`;
    if (detail !== null) return detail;
  }
  if (value === undefined || value === null) return 'no error detail';
  return safeJson(value);
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(rejectionMessage(value));
}

function isHostMediated(action: string): boolean {
  return HOST_MEDIATED_ACTIONS.some((candidate) => candidate === action);
}

export function defaultTimeoutFor(action: string): number {
  return action === 'GET_USER_ACCOUNT' ? USER_ACCOUNT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

export function classifyRejection(action: string, value: unknown): BridgeFailure {
  const message = rejectionMessage(value);
  const base = { action, message, hostMediated: isHostMediated(action) };

  if (value instanceof BridgeTimeoutError || TIMEOUT_PATTERN.test(message)) {
    return { ...base, kind: 'timeout' };
  }
  if (GATEWAY_REJECTION_PATTERN.test(message) || REJECTION_PATTERN.test(message)) {
    return { ...base, kind: 'host-rejected' };
  }
  return { ...base, kind: 'transport-error' };
}

function asRequestFn(value: unknown): QortalRequestFn | null {
  return typeof value === 'function' ? (value as QortalRequestFn) : null;
}

/**
 * Core injects `/apps/q-apps.js` as a **classic** script, so it declares
 * `qortalRequest` with `const`: a *lexical* global binding, not a property of
 * `globalThis`.
 *
 * Verified live on 2026-09-16 inside a real render context
 * (`/render/WEBSITE/<name>/`, Core `qortal-6.1.9-108bf19`):
 * `typeof globalThis.qortalRequest` was `'undefined'` while the bare identifier
 * was a function. Reading only the property therefore reported "no bridge" in a
 * real host — owner mode could never be derived there, even though the bridge
 * was present and answering.
 *
 * The `typeof` guard never throws for an undeclared identifier, so the binding
 * is only read when the host actually declared it. The property form remains as
 * the fallback for injected doubles.
 */
declare const qortalRequest: unknown;

export function detectQortalRequest(): unknown {
  if (typeof qortalRequest === 'function') return qortalRequest;
  const candidate = (globalThis as { readonly qortalRequest?: unknown }).qortalRequest;
  return typeof candidate === 'function' ? candidate : undefined;
}

export function defaultBridgeScope(): BridgeScope {
  const scope = globalThis as unknown as BridgeScope;
  if (asRequestFn(scope.qortalRequest) !== null) return scope;
  return { qortalRequest: detectQortalRequest() };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, action: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new BridgeTimeoutError(action, timeoutMs));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(toError(error));
      },
    );
  });
}

/**
 * Some responses must be read as a failure even when they resolve: the gateway
 * shim answers interactive actions with `{error: "…"}`. Returns `undefined` when
 * there is no embedded error (which is distinct from an error value of `null`).
 */
const NO_EMBEDDED_ERROR = Symbol('no-embedded-error');

function resolvedError(value: unknown): unknown {
  if (!isRecord(value)) return NO_EMBEDDED_ERROR;
  const error = value.error;
  if (error === undefined || error === null || error === false) return NO_EMBEDDED_ERROR;
  return error;
}

export function createBridge(scope: BridgeScope = defaultBridgeScope()): QortalBridge {
  const requestFn = asRequestFn(scope.qortalRequest);

  if (requestFn === null) {
    const failure = (action: string): BridgeFailure => ({
      kind: 'no-bridge',
      action,
      message: 'No Qortal bridge in this document (not rendered by a Qortal host)',
      hostMediated: isHostMediated(action),
    });

    return {
      available: false,
      describe: 'no bridge',
      request: <T>(action: QortalAction): Promise<BridgeOutcome<T>> =>
        Promise.resolve({ ok: false, error: failure(action) }),
    };
  }

  return {
    available: true,
    describe: 'window.qortalRequest (Core-injected app bridge)',
    async request<T>(
      action: QortalAction,
      payload: Readonly<Record<string, unknown>> = {},
      options: BridgeRequestOptions = {},
    ): Promise<BridgeOutcome<T>> {
      const timeoutMs = options.timeoutMs ?? defaultTimeoutFor(action);

      let raw: unknown;
      try {
        raw = await withTimeout(requestFn({ action, ...payload }), timeoutMs, action);
      } catch (error: unknown) {
        return { ok: false, error: classifyRejection(action, error) };
      }

      const embedded = resolvedError(raw);
      if (embedded !== NO_EMBEDDED_ERROR) {
        return { ok: false, error: classifyRejection(action, embedded) };
      }

      if (raw === undefined || raw === null) {
        return {
          ok: false,
          error: {
            kind: 'malformed-response',
            action,
            message: 'The host answered with an empty response',
            hostMediated: isHostMediated(action),
          },
        };
      }

      return { ok: true, value: raw as T };
    },
  };
}
