import { describe, expect, it } from 'vitest';

import { MINT_ATTEMPTS, generateIdentifier, slugifyTitle } from '../src/content/identifier';
import { MAX_IDENTIFIER_LENGTH, isValidIdentifier } from '../src/content/schema';

describe('identifier generation', () => {
  it('follows the approved prefix/slug/suffix policy', () => {
    const id = generateIdentifier('highlight', 'Why choose us?', {
      now: 1789430400000,
      random: () => 0.5,
    });

    expect(id.startsWith('qwb_hl_why-choose-us-')).toBe(true);
    expect(isValidIdentifier(id)).toBe(true);
    expect(id).toMatch(/^qwb_hl_why-choose-us-[a-z0-9]+-[a-z0-9]{4}$/);
    expect(id.length).toBeLessThanOrEqual(MAX_IDENTIFIER_LENGTH);
  });

  it.each([
    ['site', 'qwb_site_'],
    ['highlight', 'qwb_hl_'],
    ['service', 'qwb_svc_'],
    ['step', 'qwb_step_'],
    ['work', 'qwb_work_'],
    ['price', 'qwb_price_'],
    ['article', 'qwb_post_'],
  ] as const)('uses the %s prefix', (kind, prefix) => {
    const id = generateIdentifier(kind, 'A title', { now: 1, random: () => 0 });
    expect(id.startsWith(prefix)).toBe(true);
  });

  it('re-mints when the caller reports the candidate is already in use', () => {
    const draws = [0.1, 0.7, 0.9];
    let index = 0;
    const id = generateIdentifier('work', 'Project one', {
      now: 1789430400000,
      random: () => draws[Math.min(index++, draws.length - 1)] ?? 0,
      taken: (candidate) => candidate.endsWith('1'),
    });

    expect(index).toBeGreaterThan(1);
    expect(id.endsWith('1')).toBe(false);
    expect(isValidIdentifier(id)).toBe(true);
  });

  it('stops re-minting rather than looping forever', () => {
    let draws = 0;
    const id = generateIdentifier('work', 'Project one', {
      now: 1789430400000,
      random: () => {
        draws += 1;
        return 0.5;
      },
      taken: () => true,
    });

    // Four random draws build one four-character suffix, so five attempts is 20.
    expect(draws).toBe(MINT_ATTEMPTS * 4);
    expect(isValidIdentifier(id)).toBe(true);
  });

  it('stays within the identifier limit for very long titles', () => {
    const id = generateIdentifier('article', 'x'.repeat(400), {
      now: 1789430400000,
      random: () => 0.9,
    });

    expect(id.length).toBeLessThanOrEqual(MAX_IDENTIFIER_LENGTH);
    expect(isValidIdentifier(id)).toBe(true);
  });

  it('never reuses an identifier for a different title or draw', () => {
    const options = { now: 1789430400000, random: () => 0.25 };
    const first = generateIdentifier('work', 'Project one', options);
    const second = generateIdentifier('work', 'Project two', options);
    const third = generateIdentifier('work', 'Project one', {
      now: 1789430400000,
      random: () => 0.75,
    });

    expect(new Set([first, second, third]).size).toBe(3);
  });

  it('produces identifiers safe for a URL path segment', () => {
    const id = generateIdentifier('service', 'Café & CRM — Qortal!', {
      now: 1789430400000,
      random: () => 0.1,
    });

    expect(isValidIdentifier(id)).toBe(true);
    expect(encodeURIComponent(id)).toBe(id);
  });
});

describe('slugifyTitle', () => {
  it('folds to lowercase identifier characters', () => {
    expect(slugifyTitle('Hello, World!')).toBe('hello-world');
    expect(slugifyTitle('Ünïcode — dash')).toBe('unicode-dash');
    expect(slugifyTitle('...')).toBe('item');
    expect(slugifyTitle('')).toBe('item');
  });

  it('clips to the requested length without a trailing separator', () => {
    expect(slugifyTitle('a very long title indeed', 8)).toBe('a-very-l');
    expect(slugifyTitle('abcd efgh', 4)).toBe('abcd');
  });
});
