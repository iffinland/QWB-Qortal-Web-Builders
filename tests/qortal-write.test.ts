import { describe, expect, it } from 'vitest';

import { createBridge } from '../src/qortal/bridge';
import {
  WRITE_STATE_DESCRIPTION,
  WRITE_STATE_LABEL,
  classifyPublishOutcome,
  isVerified,
  verifyServedRevision,
} from '../src/qortal/write';

const EXPECTED = { service: 'JSON', name: 'Qortal Web Builders', identifier: 'qwb_work_x' };

function rejecting(value: unknown) {
  return createBridge({ qortalRequest: () => Promise.reject(value) });
}

describe('publish outcome classification', () => {
  it('reports a signed submission as submitted but never as available', async () => {
    const outcome = await createBridge({
      qortalRequest: () => Promise.resolve({ signature: 'sig123' }),
    }).request('PUBLISH_QDN_RESOURCE');

    const classification = classifyPublishOutcome(outcome, EXPECTED);

    expect(classification.state).toBe('submitted');
    expect(classification.submission).toEqual({ signature: 'sig123', ...EXPECTED });
    expect(classification.availability).toBe('unverified');
    expect(isVerified(classification)).toBe(false);
  });

  it('treats a signature-less success as ambiguous rather than submitted', async () => {
    const outcome = await createBridge({ qortalRequest: () => Promise.resolve({}) }).request(
      'PUBLISH_QDN_RESOURCE',
    );

    const classification = classifyPublishOutcome(outcome, EXPECTED);

    expect(classification.state).toBe('ambiguous');
    expect(classification.submission).toBeNull();
  });

  it('classifies a timeout as ambiguous and keeps it non-retryable', async () => {
    const classification = classifyPublishOutcome(
      await rejecting('The request timed out').request('PUBLISH_QDN_RESOURCE'),
      EXPECTED,
    );

    expect(classification.state).toBe('ambiguous');
    expect(classification.detail).toContain('do not retry automatically');
  });

  it('classifies a declined approval as rejected, not failed', async () => {
    const classification = classifyPublishOutcome(
      await rejecting({ error: 'Request declined by the user' }).request('PUBLISH_QDN_RESOURCE'),
      EXPECTED,
    );

    expect(classification.state).toBe('rejected');
  });

  it('classifies a missing bridge or transport error as failed', async () => {
    const noBridge = classifyPublishOutcome(
      await createBridge({}).request('PUBLISH_QDN_RESOURCE'),
      EXPECTED,
    );
    const transport = classifyPublishOutcome(
      await rejecting(new Error('connection reset')).request('PUBLISH_QDN_RESOURCE'),
      EXPECTED,
    );

    expect(noBridge.state).toBe('failed');
    expect(transport.state).toBe('failed');
  });

  it('keeps truthful wording for every state', () => {
    for (const state of ['submitted', 'rejected', 'ambiguous', 'failed'] as const) {
      expect(WRITE_STATE_LABEL[state]).not.toMatch(/saved|published successfully|live/i);
      expect(WRITE_STATE_DESCRIPTION[state].length).toBeGreaterThan(20);
    }
    expect(WRITE_STATE_LABEL.submitted).toContain('availability not yet verified');
  });
});

describe('served-revision verification', () => {
  it('only verifies an exact revision match', () => {
    expect(verifyServedRevision(4, 4)).toBe('verified');
    expect(verifyServedRevision(4, 3)).toBe('not-yet-served');
    expect(verifyServedRevision(4, 5)).toBe('superseded');
    expect(verifyServedRevision(4, null)).toBe('not-yet-served');
  });
});
