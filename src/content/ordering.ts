/**
 * Persistent ordering.
 *
 * The approved model is **sparse ordering** (audit §6.2): each entity carries an
 * `order` number and a reorder republishes **one** entity, so a reorder costs one
 * write and never renumbers the whole group. The moved entity gets a value
 * strictly between its new neighbours:
 *
 * ```
 *   up:   prev.order  <  newOrder  <  target.order
 *   down: target.order <  newOrder  <  next.order
 * ```
 *
 * Repeated moves inside the same gap shrink it geometrically; when the gap is no
 * longer representable (`MIN_ORDER_GAP`) or the stored orders are duplicated, the
 * plan falls back to renumbering the group in `ORDER_GAP` steps and reports that
 * it did, so the UI can say how many entities were republished.
 *
 * A plan is pure data: it never touches the DOM, never publishes and never trusts
 * the on-screen order (Phase 2's reorder was DOM-only and is explicitly
 * re-derived from the loaded bundle here).
 */

import type { AnyEntity } from './schema';

/** Gap between renumbered neighbours (10, 20, 30 …). */
export const ORDER_GAP = 10;
/** Below this the midpoint is no longer meaningfully distinct. */
export const MIN_ORDER_GAP = 0.001;

export interface OrderUpdate {
  readonly id: string;
  readonly order: number;
  readonly previousOrder: number;
}

export type ReorderPlan =
  | {
      readonly ok: true;
      readonly updates: readonly OrderUpdate[];
      /** `true` when the plan renumbered the whole group instead of one midpoint. */
      readonly renumbered: boolean;
      readonly movedId: string;
    }
  | { readonly ok: false; readonly reason: string };

/** The display order the read path uses; the plan must agree with it. */
export function displayOrder<E extends AnyEntity>(entities: readonly E[]): readonly E[] {
  return [...entities].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function renumber(entities: readonly AnyEntity[]): readonly OrderUpdate[] {
  return entities
    .map((entity, index) => ({
      id: entity.id,
      order: (index + 1) * ORDER_GAP,
      previousOrder: entity.order,
    }))
    .filter((update) => update.order !== update.previousOrder);
}

/**
 * Plans the single write (or the renumber fallback) for one ↑/↓ move.
 *
 * `direction: 'up'` moves the entity one position earlier in the displayed list.
 * An entity at the edge, or an id that is not in `entities`, is refused with a
 * reason instead of publishing a no-op.
 */
export function planReorder(
  entities: readonly AnyEntity[],
  movedId: string,
  direction: 'up' | 'down',
): ReorderPlan {
  const sorted = displayOrder(entities);
  const index = sorted.findIndex((entity) => entity.id === movedId);
  if (index === -1) return { ok: false, reason: 'that item is not part of the loaded content' };

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  const moved = sorted[index];
  const target = sorted[targetIndex];
  if (moved === undefined || target === undefined) {
    return {
      ok: false,
      reason:
        direction === 'up'
          ? 'that item is already first in its group'
          : 'that item is already last in its group',
    };
  }

  const neighbour = direction === 'up' ? sorted[index - 2] : sorted[index + 2];
  const lower = direction === 'up' ? (neighbour?.order ?? null) : target.order;
  const upper = direction === 'up' ? target.order : (neighbour?.order ?? null);

  const candidate = ((): number | null => {
    if (lower === null && upper === null) return null;
    if (lower === null) {
      const value = upper === null ? null : upper - ORDER_GAP;
      return value === null || value < 0 ? null : value;
    }
    if (upper === null) return lower + ORDER_GAP;
    const gap = upper - lower;
    return gap > MIN_ORDER_GAP ? lower + gap / 2 : null;
  })();

  if (candidate !== null && candidate !== moved.order) {
    return {
      ok: true,
      updates: [{ id: moved.id, order: candidate, previousOrder: moved.order }],
      renumbered: false,
      movedId: moved.id,
    };
  }

  const updates = renumber(sorted);
  if (updates.length === 0) {
    return { ok: false, reason: 'the stored order already matches the requested position' };
  }
  return { ok: true, updates, renumbered: true, movedId: moved.id };
}
