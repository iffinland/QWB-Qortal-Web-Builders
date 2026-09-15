/**
 * Unsaved owner drafts.
 *
 * A draft is an **open, edited form whose changes are not published yet**. The
 * registry exists so the owner bar can state that truthfully ("1 unsaved draft —
 * not published") without the bar having to know which dialogs are open.
 *
 * Ordering is no longer a draft: Phase 3 persists a reorder immediately (one
 * midpoint write per move, verified by re-read), so there is nothing to stage or
 * discard globally. Each form owns its own dirty guard and its own draft, which is
 * what is kept when a write is rejected or ambiguous.
 */

export interface DraftEntry {
  readonly key: string;
  readonly label: string;
}

export interface DraftStore {
  readonly count: number;
  /** Registers/refreshes a dirty form; `label === null` clears that key. */
  setDirty(key: string, label: string | null): void;
  list(): readonly DraftEntry[];
  clear(): void;
  subscribe(listener: () => void): () => void;
}

export function createDraftStore(): DraftStore {
  let drafts: readonly DraftEntry[] = [];
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    get count() {
      return drafts.length;
    },
    setDirty(key, label) {
      const existing = drafts.find((entry) => entry.key === key);
      if (label === null) {
        if (existing === undefined) return;
        drafts = drafts.filter((entry) => entry.key !== key);
        notify();
        return;
      }
      if (existing?.label === label) return;
      drafts = [...drafts.filter((entry) => entry.key !== key), { key, label }];
      notify();
    },
    list() {
      return drafts;
    },
    clear() {
      if (drafts.length === 0) return;
      drafts = [];
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
