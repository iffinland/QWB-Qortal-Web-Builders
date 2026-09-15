/**
 * The per-entity write log.
 *
 * This is the module that makes "one in-flight write per identifier" real, keeps
 * the label a status entry was created with, and remembers the last write that was
 * not verified so the owner bar can offer an explicit re-check. It must never
 * retry anything itself — the tests pin that it only records.
 */

import { describe, expect, it } from 'vitest';

import { WRITE_LOG_LIMIT, createWriteLog } from '../src/owner/writes';

describe('write log', () => {
  it('tracks one in-flight write per identifier', () => {
    const log = createWriteLog({ now: () => 1 });
    expect(log.pendingCount()).toBe(0);
    expect(log.isBusy('qwb_hl_a')).toBe(false);

    log.begin({ key: 'qwb_hl_a', label: 'Featured card: A', kind: 'highlight', expectedRev: 2 });
    log.begin({ key: 'qwb_hl_b', label: 'Featured card: B', kind: 'highlight', expectedRev: 2 });

    expect(log.isBusy('qwb_hl_a')).toBe(true);
    expect(log.pendingCount()).toBe(2);
    expect(log.entries()).toHaveLength(2);

    log.settle('qwb_hl_a', {
      state: 'submitted',
      availability: 'verified',
      detail: 'verified',
      servedRev: 2,
    });

    expect(log.isBusy('qwb_hl_a')).toBe(false);
    expect(log.pendingCount()).toBe(1);
    // Only one entry per identifier: settling replaces the in-flight entry.
    expect(log.entries().filter((entry) => entry.key === 'qwb_hl_a')).toHaveLength(1);
  });

  it('keeps the label and revision a write was opened with', () => {
    const log = createWriteLog({ now: () => 1 });
    log.begin({ key: 'qwb_hl_a', label: 'Featured card: A', kind: 'highlight', expectedRev: 7 });
    log.setStage('qwb_hl_a', 'verifying');
    expect(log.entries()[0]?.detail).toBe('Reading the resource back…');

    log.settle('qwb_hl_a', {
      state: 'submitted',
      availability: 'not-yet-served',
      detail: 'not visible yet',
      servedRev: null,
    });

    const entry = log.entries()[0];
    expect(entry?.label).toBe('Featured card: A');
    expect(entry?.expectedRev).toBe(7);
    expect(entry?.stage).toBe('settled');
    expect(entry?.availability).toBe('not-yet-served');
  });

  it('remembers the newest write that was not verified', () => {
    const log = createWriteLog();
    expect(log.lastUnverified()).toBeNull();

    log.begin({ key: 'qwb_hl_a', label: 'A', kind: 'highlight', expectedRev: 2 });
    log.settle('qwb_hl_a', {
      state: 'submitted',
      availability: 'verified',
      detail: 'ok',
      servedRev: 2,
    });
    expect(log.lastUnverified()).toBeNull();

    log.begin({ key: 'qwb_hl_b', label: 'B', kind: 'highlight', expectedRev: 2 });
    log.settle('qwb_hl_b', {
      state: 'ambiguous',
      availability: 'unverified',
      detail: 'unknown',
      servedRev: null,
    });
    expect(log.lastUnverified()?.key).toBe('qwb_hl_b');

    log.begin({ key: 'qwb_hl_c', label: 'C', kind: 'highlight', expectedRev: 3 });
    log.settle('qwb_hl_c', {
      state: 'submitted',
      availability: 'not-yet-served',
      detail: 'later',
      servedRev: null,
    });
    // Newest first: the most recent unresolved write is the one to re-check.
    expect(log.lastUnverified()?.key).toBe('qwb_hl_c');
  });

  it('bounds the log and notifies subscribers', () => {
    let notified = 0;
    const log = createWriteLog();
    const unsubscribe = log.subscribe(() => {
      notified += 1;
    });

    for (let index = 0; index < WRITE_LOG_LIMIT + 5; index += 1) {
      log.begin({
        key: `qwb_hl_${String(index)}`,
        label: `Item ${String(index)}`,
        kind: 'highlight',
        expectedRev: 1,
      });
    }
    expect(log.entries()).toHaveLength(WRITE_LOG_LIMIT);
    expect(notified).toBe(WRITE_LOG_LIMIT + 5);

    unsubscribe();
    log.begin({ key: 'qwb_hl_after', label: 'After', kind: 'highlight', expectedRev: 1 });
    expect(notified).toBe(WRITE_LOG_LIMIT + 5);
  });

  it('never writes, publishes or retries anything itself', () => {
    const log = createWriteLog();
    log.begin({ key: 'qwb_hl_a', label: 'A', kind: 'highlight', expectedRev: 1 });
    log.settle('qwb_hl_a', {
      state: 'ambiguous',
      availability: 'unverified',
      detail: 'unknown',
      servedRev: null,
    });
    // Settling twice is idempotent bookkeeping; nothing is resubmitted.
    log.settle('qwb_hl_a', {
      state: 'ambiguous',
      availability: 'unverified',
      detail: 'unknown',
      servedRev: null,
    });
    expect(log.entries()).toHaveLength(1);
    expect(log.entries()[0]?.detail).toBe('unknown');
  });
});
