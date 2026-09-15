/**
 * Owner UI shell.
 *
 * Single owner of "is any owner UI on screen right now". The rule it enforces is
 * the one the owner set: a non-owner sees exactly the Phase 1 public site —
 * `attach()` with any status other than a confirmed owner adds nothing to the
 * DOM, and a state change to a non-owner status removes everything it added.
 */

import type { ContentBundle } from '../content/schema';
import type { Route } from '../router';
import { showToast } from '../ui/toast';
import { closeAllModals } from '../ui/modal';
import type { OwnerSession, OwnerSessionState } from './session';
import type { DraftStore } from './drafts';
import type { OwnerFlows } from './flows';
import type { WriteLog } from './writes';
import { mountOwnerBar } from './bar';
import { mountOwnerControls } from './controls';
import { ownerTargetsFor } from './targets';

export interface OwnerShellDeps {
  readonly session: OwnerSession;
  readonly drafts: DraftStore;
  readonly writes: WriteLog;
  readonly flows: OwnerFlows;
  readonly view: () => { readonly route: Route; readonly content: ContentBundle };
  readonly requestRerender: () => void;
}

export interface OwnerShell {
  attach(root: HTMLElement): void;
  destroy(): void;
  /** Diagnostics from the last mount (renderer drift, missing containers). */
  diagnostics(): readonly string[];
}

/** The viewport where the bar carries its global information inline. */
export const OWNER_BAR_EXPANDED_QUERY = '(min-width: 768px)';

/**
 * The bar starts expanded where there is room for it (`§9.4`: the global status,
 * the pending count and "Re-check owner mode" are part of the bar, not behind a
 * click) and collapsed on a phone, where `§9.5` makes it a badge that opens a
 * sheet. Absent `matchMedia` (jsdom, non-browser hosts) the safe default is the
 * collapsed badge: hiding information is recoverable, an overflowing bar is not.
 */
function defaultExpanded(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(OWNER_BAR_EXPANDED_QUERY).matches;
}

export function createOwnerShell(deps: OwnerShellDeps): OwnerShell {
  let teardownBar: (() => void) | null = null;
  let teardownControls: (() => void) | null = null;
  let unsubscribe: (() => void) | null = null;
  let expanded = defaultExpanded();
  let lastDiagnostics: readonly string[] = [];

  const detach = (): void => {
    teardownControls?.();
    teardownBar?.();
    teardownControls = null;
    teardownBar = null;
  };

  function render(root: HTMLElement): void {
    detach();
    const state = deps.session.state;

    if (state.status !== 'owner') {
      // Fail closed: no owner UI of any kind for a non-owner.
      lastDiagnostics = [];
      return;
    }

    teardownBar = mountOwnerBar(root, {
      state,
      session: deps.session,
      flows: deps.flows,
      drafts: deps.drafts,
      writes: deps.writes,
      isExpanded: () => expanded,
      onToggleExpanded: () => {
        expanded = !expanded;
        render(root);
      },
      onReverifyRequested: () => {
        render(root);
      },
      requestRerender: deps.requestRerender,
    });

    const { route, content } = deps.view();
    const result = mountOwnerControls(root, ownerTargetsFor(route, content), {
      flows: deps.flows,
      drafts: deps.drafts,
    });
    teardownControls = result.teardown;
    lastDiagnostics = result.diagnostics;
    for (const diagnostic of result.diagnostics) {
      console.info(`[qwb owner] ${diagnostic}`);
    }
  }

  function onStateChange(state: OwnerSessionState, previous: OwnerSessionState): void {
    if (previous.status === 'owner' && state.status !== 'owner') {
      showToast(
        `Owner mode ended (${state.detail}). Owner controls were removed. Anything already typed into an open form is still there.`,
        { tone: 'warning' },
      );
      deps.flows.notifyOwnerModeEnded(state.detail);
    }
    const root = document.getElementById('app');
    if (root !== null) render(root);
  }

  return {
    attach(root) {
      if (unsubscribe === null) unsubscribe = deps.session.subscribe(onStateChange);
      render(root);
    },
    destroy() {
      unsubscribe?.();
      unsubscribe = null;
      detach();
      closeAllModals();
    },
    diagnostics() {
      return lastDiagnostics;
    },
  };
}
