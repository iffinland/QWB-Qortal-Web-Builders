/**
 * Pure edit helpers for the owner console.
 *
 * Every helper returns a new entity with `rev + 1`; nothing here writes. The
 * console passes the result to `saveEntity`, which performs the owner check, the
 * revision check and the read-back verification.
 */

import type { AnyEntity, EntityKind } from './schema';
import { MAX_IDENTIFIER_LENGTH, identifierPrefixFor, isValidSlug } from './schema';

/** A new identifier: kind prefix, slug, creation time and a random suffix; never reused. */
export function newIdentifier(kind: EntityKind, slug: string, now: number, random: string): string {
  const prefix = identifierPrefixFor(kind);
  const suffix = `-${now.toString(36)}-${random}`;
  const room = MAX_IDENTIFIER_LENGTH - prefix.length - suffix.length;
  const trimmed = slug.slice(0, Math.max(1, room)).replace(/-+$/g, '');
  return `${prefix}${trimmed}${suffix}`;
}

export function slugFromTitle(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return isValidSlug(slug) ? slug : 'item';
}

/** The next revision of an existing entity, with `updatedAt` refreshed. */
export function nextRevision<E extends AnyEntity>(
  entity: E,
  now: number,
  change: Readonly<Record<string, unknown>> = {},
): E {
  // The change set only ever carries editable envelope fields (hidden, state,
  // deletedAt, order) or payload fields; identity and kind are never touched here.
  return {
    ...entity,
    ...change,
    rev: entity.rev + 1,
    updatedAt: now,
  };
}

/** Owner hides or shows an entity without deleting it. */
export function setHidden<E extends AnyEntity>(entity: E, hidden: boolean, now: number): E {
  return nextRevision(entity, now, { hidden });
}

/** Logical delete: a republished tombstone (Qortal has no app-level QDN delete). */
export function tombstone<E extends AnyEntity>(entity: E, now: number): E {
  return nextRevision(entity, now, { state: 'deleted', deletedAt: now });
}

/**
 * Reorder with sparse order values: swaps the `order` of the entity with its
 * neighbour in the direction given. Returns the two revised entities, or null
 * when the move is not possible (already first or last).
 */
export function swapOrder<E extends AnyEntity>(
  entities: readonly E[],
  index: number,
  direction: 'up' | 'down',
  now: number,
): readonly [E, E] | null {
  const neighbourIndex = direction === 'up' ? index - 1 : index + 1;
  const current = entities[index];
  const neighbour = entities[neighbourIndex];
  if (current === undefined || neighbour === undefined) return null;
  return [
    nextRevision(current, now, { order: neighbour.order }),
    nextRevision(neighbour, now, { order: current.order }),
  ];
}
