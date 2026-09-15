/**
 * Owner session state.
 *
 * Owns the single in-memory owner decision for the page session and the rules
 * for when it is re-derived:
 *
 *  - once at boot;
 *  - on every privileged action (`assertOwner`) — a control that was rendered
 *    while the account owned the publishing name must not act after an account
 *    switch;
 *  - when the document becomes visible again (the host sends no
 *    account-changed event, so visibility regain is the only "the user may have
 *    changed something" signal available);
 *  - on an explicit owner-bar "Re-check";
 *  - after a route change **only** while the previous attempt was inconclusive,
 *    so a visitor is not prompted repeatedly.
 *
 * Nothing is persisted: no `owner=true`, no localStorage, no session storage.
 * A reload re-derives everything, which is the point.
 */

import type { AppIdentity, HostContextKind, OwnerModeBlockedReason } from '../qortal/context';
import { defaultGlobalScope, readAppIdentity } from '../qortal/context';
import type { QortalBridge } from '../qortal/bridge';
import { createBridge, defaultBridgeScope } from '../qortal/bridge';
import type { OwnerDecision, OwnerDecisionReason, OwnerStatus } from '../qortal/identity';
import { determineOwner } from '../qortal/identity';
import { QDN_WRITE_ENABLED } from './phase';

export type ReverifyTrigger =
  'boot' | 'action' | 'visibility' | 'route-change' | 'manual' | 'reload-content';

export interface OwnerSessionState {
  readonly status: OwnerStatus;
  readonly reason: OwnerDecisionReason | null;
  readonly detail: string;
  readonly publishingName: string;
  readonly service: string;
  readonly context: HostContextKind;
  readonly accountAddress: string;
  readonly accountNames: readonly string[];
  readonly interactive: boolean;
  readonly ownerModeBlockedReason: OwnerModeBlockedReason | null;
  readonly checking: boolean;
  readonly lastCheckedAt: number | null;
  readonly writeEnabled: boolean;
}

export type OwnerSessionListener = (state: OwnerSessionState, previous: OwnerSessionState) => void;

export interface OwnerSession {
  readonly state: OwnerSessionState;
  readonly app: AppIdentity;
  readonly bridge: QortalBridge;
  subscribe(listener: OwnerSessionListener): () => void;
  /** Boot check plus the visibility-regain listener. Idempotent. */
  start(): void;
  stop(): void;
  /** Re-derives the decision; an explicit trigger always runs. */
  reverify(
    trigger: ReverifyTrigger,
    options?: { readonly timeoutMs?: number },
  ): Promise<OwnerDecision>;
  /** Privileged-action gate: re-verifies and returns whether owner mode holds. */
  assertOwner(options?: { readonly timeoutMs?: number }): Promise<boolean>;
  /** Bounded automatic re-check; never queues behind an in-flight check. */
  maybeReverify(trigger: Extract<ReverifyTrigger, 'visibility' | 'route-change'>): void;
}

export interface OwnerSessionOptions {
  readonly bridge?: QortalBridge;
  readonly app?: AppIdentity;
  readonly doc?: Document;
  readonly now?: () => number;
  /** Minimum spacing for automatic (non-explicit) re-checks. */
  readonly autoReverifyMinIntervalMs?: number;
  readonly bootTimeoutMs?: number;
  readonly actionTimeoutMs?: number;
  readonly autoTimeoutMs?: number;
}

/** Automatic re-checks are cheap when permission is already granted, but a
    repeated prompt is worse than a stale decision, so they are rate-limited. */
export const AUTO_REVERIFY_MIN_INTERVAL_MS = 15_000;
export const BOOT_TIMEOUT_MS = 60_000;
export const ACTION_TIMEOUT_MS = 60_000;
export const AUTO_TIMEOUT_MS = 15_000;

export function createOwnerSession(options: OwnerSessionOptions = {}): OwnerSession {
  const now = options.now ?? (() => Date.now());
  const doc = options.doc ?? document;
  const app = options.app ?? readAppIdentity(defaultGlobalScope());
  const bridge = options.bridge ?? createBridge(defaultBridgeScope());
  const autoMinIntervalMs = options.autoReverifyMinIntervalMs ?? AUTO_REVERIFY_MIN_INTERVAL_MS;

  const listeners = new Set<OwnerSessionListener>();
  let lastAttemptAt = 0;
  let inFlight: Promise<OwnerDecision> | null = null;
  let started = false;

  let state: OwnerSessionState = {
    status: app.ownerModeBlockedReason === null ? 'inconclusive' : 'unavailable',
    reason:
      app.ownerModeBlockedReason === null
        ? null
        : app.ownerModeBlockedReason === 'no-bridge'
          ? 'no-bridge'
          : app.ownerModeBlockedReason === 'non-interactive-context'
            ? 'non-interactive-context'
            : 'empty-publishing-name',
    detail: 'owner mode has not been checked yet',
    publishingName: app.name,
    service: app.service,
    context: app.context,
    accountAddress: '',
    accountNames: [],
    interactive: app.interactive,
    ownerModeBlockedReason: app.ownerModeBlockedReason,
    checking: false,
    lastCheckedAt: null,
    writeEnabled: QDN_WRITE_ENABLED,
  };

  function setState(patch: Partial<OwnerSessionState>): void {
    const previous = state;
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state, previous);
  }

  function applyDecision(decision: OwnerDecision): void {
    setState({
      status: decision.status,
      reason: decision.reason,
      detail: decision.detail,
      publishingName: decision.publishingName,
      service: decision.service,
      context: decision.context,
      accountAddress: decision.accountAddress,
      accountNames: decision.accountNames,
      lastCheckedAt: decision.checkedAt,
      checking: false,
    });
  }

  async function runCheck(timeoutMs: number): Promise<OwnerDecision> {
    lastAttemptAt = now();
    setState({ checking: true });
    const decision = await determineOwner({ app, bridge }, { timeoutMs, now });
    applyDecision(decision);
    return decision;
  }

  function reverify(
    trigger: ReverifyTrigger,
    checkOptions: { readonly timeoutMs?: number } = {},
  ): Promise<OwnerDecision> {
    if (!app.interactive) {
      const decision = {
        status: 'unavailable' as const,
        reason: (app.ownerModeBlockedReason === 'no-bridge'
          ? 'no-bridge'
          : app.ownerModeBlockedReason === 'non-interactive-context'
            ? 'non-interactive-context'
            : 'empty-publishing-name') as OwnerDecisionReason,
        detail: state.detail,
        publishingName: app.name,
        service: app.service,
        context: app.context,
        accountAddress: '',
        accountNames: [],
        checkedAt: state.lastCheckedAt ?? now(),
      };
      return Promise.resolve(decision);
    }

    if (inFlight !== null) return inFlight;

    const defaultTimeout =
      trigger === 'action'
        ? (options.actionTimeoutMs ?? ACTION_TIMEOUT_MS)
        : trigger === 'boot' || trigger === 'manual' || trigger === 'reload-content'
          ? (options.bootTimeoutMs ?? BOOT_TIMEOUT_MS)
          : (options.autoTimeoutMs ?? AUTO_TIMEOUT_MS);

    const timeoutMs = checkOptions.timeoutMs ?? defaultTimeout;
    const run = runCheck(timeoutMs).finally(() => {
      inFlight = null;
    });
    inFlight = run;
    return run;
  }

  function maybeReverify(trigger: 'visibility' | 'route-change'): void {
    if (!app.interactive) return;
    if (inFlight !== null) return;
    // A confirmed owner or a definitive visitor is not re-checked on every
    // navigation: that would re-prompt on pages nobody is editing. Visibility
    // regain always re-checks (bounded), because an account switch is otherwise
    // unobservable.
    if (trigger === 'route-change' && (state.status === 'owner' || state.status === 'visitor')) {
      return;
    }
    if (now() - lastAttemptAt < autoMinIntervalMs) return;
    void session.reverify(trigger);
  }

  const onVisibilityChange = (): void => {
    if (doc.visibilityState !== 'visible') return;
    maybeReverify('visibility');
  };

  // Every internal caller goes through the returned object so there is exactly
  // one entry point for re-verification (which is also what makes the behaviour
  // observable in tests).
  const session: OwnerSession = {
    get state() {
      return state;
    },
    app,
    bridge,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (started) return;
      started = true;
      doc.addEventListener('visibilitychange', onVisibilityChange);
      void session.reverify('boot');
    },
    stop() {
      if (!started) return;
      started = false;
      doc.removeEventListener('visibilitychange', onVisibilityChange);
    },
    reverify,
    async assertOwner(checkOptions = {}) {
      const decision = await session.reverify('action', checkOptions);
      return decision.status === 'owner';
    },
    maybeReverify,
  };

  return session;
}
