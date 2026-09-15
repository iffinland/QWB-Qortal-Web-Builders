/**
 * Unsaved owner changes.
 *
 * Phase 2 has no write path, so an "unsaved change" is exactly what the owner
 * can see and undo: a staged reorder that was applied to the DOM on screen only.
 * Tracking it explicitly is what lets the owner bar tell the truth ("2 unsaved
 * changes — not published") and lets the owner discard them, which is the same
 * dirty-state contract Phase 3 needs once a change really can be published.
 */

export interface ReorderDraft {
  readonly key: string;
  readonly entityId: string;
  readonly entityTitle: string;
  readonly direction: 'up' | 'down';
}

export interface DraftStore {
  readonly count: number;
  record(draft: ReorderDraft): void;
  list(): readonly ReorderDraft[];
  clear(): void;
  subscribe(listener: () => void): () => void;
}

export function createDraftStore(): DraftStore {
  let drafts: readonly ReorderDraft[] = [];
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    get count() {
      return drafts.length;
    },
    record(draft) {
      drafts = [...drafts, draft];
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
