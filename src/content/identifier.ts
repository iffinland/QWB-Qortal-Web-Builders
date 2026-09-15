/**
 * QDN identifier generation.
 *
 * Approved policy (audit §6, §8): identifiers are lowercase `[a-z0-9_-]`, at most
 * 60 characters, prefixed per entity kind, and generated **once** — an identifier
 * is never recycled for a different entity because doing so would destroy the
 * history of the first one.
 *
 * Phase 2 does not publish. Add flows show the candidate identifier they would
 * use so the policy is visible in the UI, and Phase 3 calls the same function at
 * publish time.
 */

import type { EntityKind } from './schema';
import { MAX_IDENTIFIER_LENGTH, identifierPrefixFor, isValidIdentifier } from './schema';

const RANDOM_LENGTH = 4;

/** Folds a title into the identifier-safe `slug` segment used after the prefix. */
export function slugifyTitle(value: string, maxLength = 24): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    // Drop the combining marks NFKD splits out ("ü" -> "u" + U+0308) so accented
    // titles fold to plain letters instead of turning into extra separators.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length <= maxLength) return slug === '' ? 'item' : slug;

  const clipped = slug.slice(0, maxLength).replace(/-+$/, '');
  return clipped === '' ? 'item' : clipped;
}

function randomSuffix(random: () => number): string {
  let suffix = '';
  for (let index = 0; index < RANDOM_LENGTH; index += 1) {
    suffix += Math.floor(random() * 36).toString(36);
  }
  return suffix;
}

/**
 * How many times a candidate is re-minted when the caller says it is already in
 * use. Each attempt draws a fresh random suffix, so five attempts against a
 * 36^4-per-millisecond space is a guard, not a constraint.
 */
export const MINT_ATTEMPTS = 5;

export interface IdentifierOptions {
  readonly now: number;
  /** Injectable for deterministic tests; defaults to `Math.random`. */
  readonly random?: () => number;
  /**
   * Reports that a candidate identifier is already taken (it exists in the loaded
   * content, so publishing under it would overwrite another entity). The mint is
   * retried with a fresh suffix. A candidate is never *recycled*: this only avoids
   * handing back one that is already in use.
   */
  readonly taken?: (candidate: string) => boolean;
}

/**
 * `qwb_<kind>_<slug>-<timestamp36>-<random>`, truncated to the identifier limit
 * while keeping the prefix and the uniqueness suffix intact.
 */
export function generateIdentifier(
  kind: EntityKind,
  title: string,
  options: IdentifierOptions,
): string {
  const random = options.random ?? Math.random;
  const prefix = identifierPrefixFor(kind);
  const timestamp = Math.max(0, Math.floor(options.now)).toString(36);
  let candidate = '';

  for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
    const suffix = `${timestamp}-${randomSuffix(random)}`;
    const budget = MAX_IDENTIFIER_LENGTH - prefix.length - suffix.length - 1;
    const slug = slugifyTitle(title, Math.max(1, Math.min(24, budget)));
    candidate = `${prefix}${slug}-${suffix}`;

    if (candidate.length > MAX_IDENTIFIER_LENGTH || !isValidIdentifier(candidate)) {
      const clipped = candidate.slice(0, MAX_IDENTIFIER_LENGTH).replace(/-+$/, '');
      candidate = isValidIdentifier(clipped) ? clipped : `${prefix}item-${suffix}`;
    }

    if (options.taken?.(candidate) !== true) return candidate;
  }

  // Every attempt collided (a 1-in-36^4-per-millisecond draw, five times over).
  // Returning the last candidate keeps the function total; the caller still owns
  // the decision to publish, and the read path de-duplicates by identifier.
  return candidate;
}
