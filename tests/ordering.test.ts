/**
 * Persistent (sparse) ordering.
 *
 * The approved model is one write per move: the moved entity gets a value strictly
 * between its new neighbours. The tests pin the midpoint, the edge refusals and the
 * renumber fallback that is used when the gap is no longer representable, so the UI
 * can tell the owner how many entities were republished.
 */

import { describe, expect, it } from 'vitest';

import { MIN_ORDER_GAP, ORDER_GAP, displayOrder, planReorder } from '../src/content/ordering';
import { SCHEMA_VERSION } from '../src/content/schema';
import type { HighlightEntity } from '../src/content/schema';

function highlight(id: string, order: number, createdAt = 0): HighlightEntity {
  return {
    schema: SCHEMA_VERSION,
    id,
    kind: 'highlight',
    rev: 1,
    state: 'active',
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    order,
    title: id,
    payload: { body: 'body', bullets: [], variant: 'plain', cta: { label: 'Go', href: '#/works' } },
  };
}

const group = [highlight('qwb_hl_a', 10), highlight('qwb_hl_b', 20), highlight('qwb_hl_c', 30)];

describe('displayOrder', () => {
  it('orders by order, then createdAt, then identifier', () => {
    const unordered = [
      highlight('qwb_hl_c', 30),
      highlight('qwb_hl_a', 10, 5),
      highlight('qwb_hl_b', 10, 1),
    ];
    expect(displayOrder(unordered).map((entity) => entity.id)).toEqual([
      'qwb_hl_b',
      'qwb_hl_a',
      'qwb_hl_c',
    ]);
  });
});

describe('planReorder', () => {
  it('writes one midpoint between the new neighbours', () => {
    const plan = planReorder(group, 'qwb_hl_c', 'up');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.renumbered).toBe(false);
    expect(plan.movedId).toBe('qwb_hl_c');
    // Strictly between its new neighbours (a at 10 and b at 20).
    expect(plan.updates).toEqual([{ id: 'qwb_hl_c', order: 15, previousOrder: 30 }]);
    expect(plan.updates[0]?.order).toBeGreaterThan(10);
    expect(plan.updates[0]?.order).toBeLessThan(20);
  });

  it('writes one midpoint when moving an item down', () => {
    const plan = planReorder(group, 'qwb_hl_a', 'down');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.renumbered).toBe(false);
    expect(plan.updates).toEqual([{ id: 'qwb_hl_a', order: 25, previousOrder: 10 }]);
  });

  it('refuses a move at the edge of the group', () => {
    const up = planReorder(group, 'qwb_hl_a', 'up');
    expect(up.ok).toBe(false);
    if (up.ok) return;
    expect(up.reason).toContain('already first');

    const down = planReorder(group, 'qwb_hl_c', 'down');
    expect(down.ok).toBe(false);
    if (down.ok) return;
    expect(down.reason).toContain('already last');
  });

  it('refuses an identifier that is not in the loaded group', () => {
    const plan = planReorder(group, 'qwb_hl_missing', 'up');
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toContain('not part of the loaded content');
  });

  it('renumbers the group when the new position cannot be represented', () => {
    // Moving the second item above the first needs order < 5, which the plan
    // refuses to write as a negative number.
    const tight = [highlight('qwb_hl_a', 5), highlight('qwb_hl_b', 10)];
    const plan = planReorder(tight, 'qwb_hl_b', 'up');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.renumbered).toBe(true);
    // Renumbering walks the *display* order and reports only the entities whose
    // stored order actually changes — that is how many writes the fallback costs.
    expect(plan.updates).toEqual([
      { id: 'qwb_hl_a', order: ORDER_GAP, previousOrder: 5 },
      { id: 'qwb_hl_b', order: ORDER_GAP * 2, previousOrder: 10 },
    ]);
  });

  it('renumbers when the gap is below the representable minimum', () => {
    const tight = [
      highlight('qwb_hl_a', 10),
      highlight('qwb_hl_b', 10 + MIN_ORDER_GAP / 2),
      highlight('qwb_hl_c', 20),
    ];
    const plan = planReorder(tight, 'qwb_hl_c', 'up');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.renumbered).toBe(true);
    // `a` is already at ORDER_GAP, so it is not republished.
    expect(plan.updates).toEqual([
      { id: 'qwb_hl_b', order: ORDER_GAP * 2, previousOrder: 10 + MIN_ORDER_GAP / 2 },
      { id: 'qwb_hl_c', order: ORDER_GAP * 3, previousOrder: 20 },
    ]);
  });

  it('refuses when the stored order already matches the requested position', () => {
    const plan = planReorder([highlight('qwb_hl_only', 10)], 'qwb_hl_only', 'up');
    expect(plan.ok).toBe(false);
  });
});
