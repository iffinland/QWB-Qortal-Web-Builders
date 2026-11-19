import { describe, expect, it } from 'vitest';

import { newIdentifier, setHidden, slugFromTitle, swapOrder, tombstone } from '../src/content/edit';
import { validateEntity, isValidIdentifier, MAX_IDENTIFIER_LENGTH } from '../src/content/schema';
import { seedBundle } from '../src/content/seed';

describe('edit helpers', () => {
  it('creates identifiers that satisfy the policy and never exceed the length limit', () => {
    const id = newIdentifier('work', 'a'.repeat(200), 1789430400000, 'k3f9');
    expect(isValidIdentifier(id)).toBe(true);
    expect(id.length).toBeLessThanOrEqual(MAX_IDENTIFIER_LENGTH);
    expect(id.startsWith('qwb_work_')).toBe(true);
  });

  it('derives URL-safe slugs from titles', () => {
    expect(slugFromTitle('Qortal Suomi – Finland!')).toBe('qortal-suomi-finland');
    expect(slugFromTitle('Ääkkönen')).toBe('aakkonen');
    expect(slugFromTitle('!!!')).toBe('item');
  });

  it('advances the revision for hide, show and delete', () => {
    const work = seedBundle.works[0]!;
    const hidden = setHidden(work, true, 5);
    expect(hidden).toMatchObject({ hidden: true, rev: work.rev + 1, updatedAt: 5 });
    expect(validateEntity(hidden).ok).toBe(true);

    const deleted = tombstone(work, 6);
    expect(deleted).toMatchObject({ state: 'deleted', deletedAt: 6, rev: work.rev + 1 });
    expect(validateEntity(deleted).ok).toBe(true);
  });

  it('reorders by swapping sparse order values with the neighbour', () => {
    const list = seedBundle.works.slice(0, 3);
    const pair = swapOrder(list, 1, 'up', 7);
    expect(pair).not.toBeNull();
    const [moved, neighbour] = pair!;
    expect(moved.id).toBe(list[1]!.id);
    expect(moved.order).toBe(list[0]!.order);
    expect(neighbour.order).toBe(list[1]!.order);
    expect(swapOrder(list, 0, 'up', 7)).toBeNull();
    expect(swapOrder(list, list.length - 1, 'down', 7)).toBeNull();
  });
});
