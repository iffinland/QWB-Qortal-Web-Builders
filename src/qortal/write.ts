/**
 * Truthful write-result classification.
 *
 * Phase 2 ships **no QDN write**. This module exists now because the classifier
 * is the part that must be designed before any write path is allowed to exist:
 * it is the single place where "the host accepted a submission" is kept
 * distinct from "the resource is served".
 *
 * Contract facts this classification rests on (Core `108bf191`, Hub `12a573b2`):
 *
 *  - `PUBLISH_QDN_RESOURCE` returns a submission (the Hub returns the signed
 *    transaction data, e.g. `{ signature }`). A submission is **not** evidence
 *    that the resource is available or that any node serves the new revision.
 *  - A declined/timed-out host approval is not a failed publish that is safe to
 *    retry: the same request may already have been relayed.
 *  - There is no QDN delete and no "deleted" resource state. A delete is a
 *    republished tombstone (`state: 'deleted'`) and the previous bytes remain
 *    retrievable, so no UI may claim content was removed from the network.
 *
 * Phase 3 adds the read-back step (`verifyServedRevision`) on top of these
 * states; the phases below are already ordered so that "verified" can only be
 * reached after a successful re-read.
 */

import type { BridgeOutcome } from './bridge';

/** Stage 1: what the host did with the request. */
export type WriteState = 'submitted' | 'rejected' | 'ambiguous' | 'failed';

/** Stage 2 (Phase 3): whether the new revision is actually served. */
export type WriteAvailability = 'unverified' | 'verified' | 'not-yet-served' | 'superseded';

export interface PublishSubmission {
  readonly signature: string;
  readonly service: string;
  readonly name: string;
  readonly identifier: string;
}

export interface WriteClassification {
  readonly state: WriteState;
  readonly detail: string;
  /** Present only for `submitted`. */
  readonly submission: PublishSubmission | null;
  /** Always `false` in Phase 2: availability needs a successful re-read. */
  readonly availability: WriteAvailability;
}

export interface ExpectedResource {
  readonly service: string;
  readonly name: string;
  readonly identifier: string;
}

/**
 * Wording that is true for every state. The UI must use these labels rather than
 * inventing optimistic copy.
 */
export const WRITE_STATE_LABEL: Readonly<Record<WriteState, string>> = {
  submitted: 'Submitted to the host — availability not yet verified',
  rejected: 'Rejected by the host — nothing was published',
  ambiguous: 'Outcome unknown — the host did not answer in time',
  failed: 'Failed — nothing was published',
};

export const WRITE_STATE_DESCRIPTION: Readonly<Record<WriteState, string>> = {
  submitted:
    'The host accepted and signed the request. This is a submission, not proof that the resource is served: the new revision must be read back before the app shows it as published.',
  rejected:
    'The request was declined, or the host refused it before signing. No change was published. Nothing was retried automatically.',
  ambiguous:
    'The request did not complete within the host timeout. It may or may not have been relayed; do not retry automatically, and do not tell the user it failed.',
  failed:
    'The request failed before signing (no bridge, transport error, or an unreadable response). No change was published.',
};

/** The tombstone wording every delete affordance has to use. */
export const TOMBSTONE_NOTICE =
  'Qortal has no app-accessible QDN delete. Deleting republishes the same identifier with state "deleted", and the previous bytes stay retrievable from the network.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSignature(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const signature = value.signature;
  return typeof signature === 'string' && signature.trim() !== '' ? signature : null;
}

/**
 * Classifies one `PUBLISH_QDN_RESOURCE` bridge outcome.
 *
 * A missing `signature` on an otherwise successful response is reported as
 * `ambiguous`, not `submitted`: the app cannot tell whether the host signed.
 */
export function classifyPublishOutcome(
  outcome: BridgeOutcome<unknown>,
  expected: ExpectedResource,
): WriteClassification {
  if (outcome.ok) {
    const signature = readSignature(outcome.value);
    if (signature === null) {
      return {
        state: 'ambiguous',
        detail:
          'The host answered without a signature, so the app cannot tell whether the request was signed.',
        submission: null,
        availability: 'unverified',
      };
    }
    return {
      state: 'submitted',
      detail: WRITE_STATE_DESCRIPTION.submitted,
      submission: { signature, ...expected },
      availability: 'unverified',
    };
  }

  switch (outcome.error.kind) {
    case 'timeout':
      return {
        state: 'ambiguous',
        detail: `${WRITE_STATE_DESCRIPTION.ambiguous} (${outcome.error.message})`,
        submission: null,
        availability: 'unverified',
      };
    case 'host-rejected':
      return {
        state: 'rejected',
        detail: `${WRITE_STATE_DESCRIPTION.rejected} (${outcome.error.message})`,
        submission: null,
        availability: 'unverified',
      };
    case 'no-bridge':
    case 'malformed-response':
    case 'transport-error':
      return {
        state: 'failed',
        detail: `${WRITE_STATE_DESCRIPTION.failed} (${outcome.error.message})`,
        submission: null,
        availability: 'unverified',
      };
  }
}

/**
 * Phase 3 gate: only a read-back that returns the expected revision promotes a
 * write to `verified`. Exported now so the write path cannot be written without
 * passing through it.
 */
export function verifyServedRevision(
  expectedRev: number,
  servedRev: number | null,
): WriteAvailability {
  if (servedRev === null) return 'not-yet-served';
  if (servedRev === expectedRev) return 'verified';
  if (servedRev > expectedRev) return 'superseded';
  return 'not-yet-served';
}

/** True when the UI may state that the change is live. */
export function isVerified(classification: WriteClassification): boolean {
  return classification.availability === 'verified';
}
