/**
 * Owner write state: in-flight protection and the truthful write log.
 *
 * The audit's rules that this module owns:
 *
 *  - **one in-flight write per entity** — a second edit of the same identifier is
 *    refused while the first is unresolved, because the host has no
 *    compare-and-swap and the last accepted publish would silently win;
 *  - **no automatic retry** — an ambiguous result stays unresolved until the
 *    owner explicitly re-checks it;
 *  - **a submission is not a result** — an entry is only "verified" when the
 *    served revision was read back, and the owner bar and status dialog render
 *    these labels verbatim instead of inventing optimistic copy.
 */

import type { WriteState, WriteAvailability } from '../qortal/write';

export type WriteStage = 'publishing' | 'verifying' | 'settled';

export interface WriteEntry {
  /** The entity identifier (media uses the same identifier, so one lock covers both). */
  readonly key: string;
  readonly label: string;
  readonly kind: string;
  readonly stage: WriteStage;
  readonly state: WriteState | null;
  readonly availability: WriteAvailability;
  readonly detail: string;
  readonly at: number;
  readonly expectedRev: number | null;
  readonly servedRev: number | null;
}

export interface WriteLog {
  /** In-flight writes. */
  pendingCount(): number;
  isBusy(key: string): boolean;
  entries(): readonly WriteEntry[];
  lastUnverified(): WriteEntry | null;
  begin(input: {
    readonly key: string;
    readonly label: string;
    readonly kind: string;
    readonly expectedRev: number | null;
  }): void;
  setStage(key: string, stage: WriteStage, detail?: string): void;
  settle(
    key: string,
    result: {
      readonly state: WriteState;
      readonly availability: WriteAvailability;
      readonly detail: string;
      readonly servedRev: number | null;
    },
  ): void;
  subscribe(listener: () => void): () => void;
}

/** Keeps the dialog bounded; the last entries are the useful ones. */
export const WRITE_LOG_LIMIT = 20;

export function createWriteLog(options: { readonly now?: () => number } = {}): WriteLog {
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<() => void>();
  let entries: readonly WriteEntry[] = [];

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const replace = (entry: WriteEntry): void => {
    entries = [entry, ...entries.filter((existing) => existing.key !== entry.key)].slice(
      0,
      WRITE_LOG_LIMIT,
    );
    notify();
  };

  return {
    pendingCount() {
      return entries.filter((entry) => entry.stage !== 'settled').length;
    },
    isBusy(key) {
      return entries.some((entry) => entry.key === key && entry.stage !== 'settled');
    },
    entries() {
      return entries;
    },
    lastUnverified() {
      return (
        entries.find((entry) => entry.stage === 'settled' && entry.availability !== 'verified') ??
        null
      );
    },
    begin(input) {
      replace({
        key: input.key,
        label: input.label,
        kind: input.kind,
        stage: 'publishing',
        state: null,
        availability: 'unverified',
        detail: 'Waiting for the host…',
        at: now(),
        expectedRev: input.expectedRev,
        servedRev: null,
      });
    },
    setStage(key, stage, detail) {
      const existing = entries.find((entry) => entry.key === key);
      if (existing === undefined) return;
      replace({
        ...existing,
        stage,
        detail: detail ?? (stage === 'verifying' ? 'Reading the resource back…' : existing.detail),
      });
    },
    settle(key, result) {
      const existing = entries.find((entry) => entry.key === key);
      replace({
        key,
        label: existing?.label ?? key,
        kind: existing?.kind ?? 'entity',
        stage: 'settled',
        state: result.state,
        availability: result.availability,
        detail: result.detail,
        at: now(),
        expectedRev: existing?.expectedRev ?? null,
        servedRev: result.servedRev,
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
