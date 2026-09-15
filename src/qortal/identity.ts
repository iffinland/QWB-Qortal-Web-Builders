/**
 * Owner recognition.
 *
 * Approved model (audit §5):
 *
 *   _qdnName (the app's publishing name, injected by Core)
 *     + GET_USER_ACCOUNT   -> the current account (host permission dialog)
 *     + GET_ACCOUNT_NAMES  -> the names that account currently owns
 *     -> case-folded membership test
 *     -> owner | visitor
 *
 * Rules this module exists to enforce:
 *
 *  - **automatic**: no in-app login, no owner picker, no "logged in as" screen;
 *  - **no hardcoded owner name or address** anywhere in the source;
 *  - **never `names[0]`**: `GET_ACCOUNT_NAMES` returns an unordered list and the
 *    publishing account legitimately owns more than one name (verified live on
 *    2026-09-15 against node `127.0.0.1:24991`: `/names/address/<owner>` returned
 *    two entries for the publishing name's owner);
 *  - **fail closed**: every failure path ends in a non-owner outcome;
 *  - **no persisted authority**: nothing about ownership is written to
 *    `localStorage`/IndexedDB/session storage. The decision lives in memory and
 *    is re-derived on demand.
 *
 * Status is deliberately finer than owner/visitor:
 *
 *  - `owner`        — membership confirmed against the current name list.
 *  - `visitor`      — the account is known and the publishing name is **not**
 *                     among its current names. Definitive.
 *  - `unavailable`  — owner mode is structurally impossible here (no bridge,
 *                     read-only context, no injected publishing name). Definitive.
 *  - `inconclusive` — an attempt was made and failed (declined/timed-out
 *                     permission dialog, node read failure, malformed payload).
 *                     This does not prove the visitor is not the owner, so it is
 *                     not treated as `visitor`; the caller may re-verify later.
 *                     Privileged actions are still refused under this status.
 */

import type { AppIdentity, HostContextKind, OwnerModeBlockedReason } from './context';
import type { BridgeFailure, QortalBridge } from './bridge';

export type OwnerStatus = 'owner' | 'visitor' | 'unavailable' | 'inconclusive';

export type OwnerDecisionReason =
  | 'publishing-name-is-owned'
  | 'publishing-name-not-owned'
  | 'no-bridge'
  | 'non-interactive-context'
  | 'empty-publishing-name'
  | 'host-rejected'
  | 'timeout'
  | 'malformed-response'
  | 'transport-error';

export interface OwnerDecision {
  readonly status: OwnerStatus;
  readonly reason: OwnerDecisionReason;
  /** Safe to display; never contains a wallet secret. */
  readonly detail: string;
  readonly publishingName: string;
  readonly service: string;
  readonly context: HostContextKind;
  readonly accountAddress: string;
  readonly accountNames: readonly string[];
  readonly checkedAt: number;
}

export interface IdentityInputs {
  readonly app: AppIdentity;
  readonly bridge: QortalBridge;
}

export interface DetermineOwnerOptions {
  readonly timeoutMs?: number;
  readonly now?: () => number;
}

/**
 * Case-folded comparison key for a registered name.
 *
 * Qortal registered names are case-insensitive; surrounding whitespace cannot be
 * part of a valid name, so trimming is safe. Internal whitespace is *not*
 * collapsed: two different registrations must never compare equal.
 */
export function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export interface ExtractedNameList {
  /** Normalised names, in response order (order is never used for the decision). */
  readonly names: readonly string[];
  /** Entries that were neither a string nor an object with a string `name`. */
  readonly malformedEntries: number;
}

/**
 * Reads the `GET_ACCOUNT_NAMES` payload.
 *
 * Verified live shape (Core `NamesResource#getNamesByAddress` -> `NameSummary`
 * list): `[{ name, owner }, …]`. The reference app also allowed bare strings, so
 * both are accepted; anything else is counted as malformed rather than trusted.
 */
export function extractNameList(value: unknown): ExtractedNameList {
  if (!Array.isArray(value)) return { names: [], malformedEntries: 0 };

  const names: string[] = [];
  let malformedEntries = 0;

  for (const entry of value as readonly unknown[]) {
    if (typeof entry === 'string') {
      if (entry.trim() !== '') names.push(normalizeName(entry));
      else malformedEntries += 1;
      continue;
    }
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      const name = (entry as { readonly name?: unknown }).name;
      if (typeof name === 'string' && name.trim() !== '') {
        names.push(normalizeName(name));
        continue;
      }
    }
    malformedEntries += 1;
  }

  return { names, malformedEntries };
}

export interface MembershipInput {
  readonly publishingName: string;
  readonly accountAddress: string;
  readonly accountNames: readonly string[];
  readonly service?: string;
  readonly context?: HostContextKind;
  readonly checkedAt: number;
  readonly malformedEntries?: number;
}

/**
 * The pure membership decision: case-folded, order-independent, never `names[0]`.
 * Exported so it can be unit-tested without a bridge.
 */
export function decideFromNames(input: MembershipInput): OwnerDecision {
  // Fail closed even for a direct caller: an empty publishing name can never be
  // "owned", and an empty entry in the name list must never satisfy it.
  const publishingKey = normalizeName(input.publishingName);
  const isOwner = publishingKey !== '' && input.accountNames.includes(publishingKey);
  const malformed = input.malformedEntries ?? 0;
  const suffix =
    malformed === 0
      ? ''
      : ` (${String(malformed)} unrecognised name list entr${malformed === 1 ? 'y' : 'ies'} ignored)`;

  return {
    status: isOwner ? 'owner' : 'visitor',
    reason: isOwner ? 'publishing-name-is-owned' : 'publishing-name-not-owned',
    detail: `${
      isOwner
        ? `the current account owns the publishing name "${input.publishingName}"`
        : `the current account does not own the publishing name "${input.publishingName}"`
    }${suffix}`,
    publishingName: input.publishingName,
    service: input.service ?? '',
    context: input.context ?? 'unknown',
    accountAddress: input.accountAddress,
    accountNames: input.accountNames,
    checkedAt: input.checkedAt,
  };
}

function unavailableDecision(
  app: AppIdentity,
  reason: OwnerModeBlockedReason,
  checkedAt: number,
): OwnerDecision {
  const detailByReason: Readonly<Record<OwnerModeBlockedReason, string>> = {
    'no-bridge': 'the app is not rendered inside a Qortal host, so no account can be resolved',
    'non-interactive-context': `the injected context "${app.rawContext || 'unknown'}" cannot carry host-mediated requests`,
    'empty-publishing-name':
      'the host injected no publishing name (developer-mode proxy), so owner mode cannot exist here',
  };

  return {
    status: 'unavailable',
    reason,
    detail: detailByReason[reason],
    publishingName: app.name,
    service: app.service,
    context: app.context,
    accountAddress: '',
    accountNames: [],
    checkedAt,
  };
}

function inconclusiveDecision(
  app: AppIdentity,
  reason: Extract<
    OwnerDecisionReason,
    'host-rejected' | 'timeout' | 'malformed-response' | 'transport-error'
  >,
  detail: string,
  checkedAt: number,
  accountAddress = '',
  accountNames: readonly string[] = [],
): OwnerDecision {
  return {
    status: 'inconclusive',
    reason,
    detail,
    publishingName: app.name,
    service: app.service,
    context: app.context,
    accountAddress,
    accountNames,
    checkedAt,
  };
}

function failureReason(
  failure: BridgeFailure,
): Extract<
  OwnerDecisionReason,
  'host-rejected' | 'timeout' | 'malformed-response' | 'transport-error'
> {
  switch (failure.kind) {
    case 'host-rejected':
      return 'host-rejected';
    case 'timeout':
      return 'timeout';
    case 'malformed-response':
      return 'malformed-response';
    case 'no-bridge':
      return 'transport-error';
    case 'transport-error':
      return 'transport-error';
  }
}

function readAddress(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return '';
  const address = (value as { readonly address?: unknown }).address;
  return typeof address === 'string' ? address.trim() : '';
}

/**
 * Runs the approved derivation. Never throws: every failure becomes a
 * non-owner `OwnerDecision`.
 */
export async function determineOwner(
  inputs: IdentityInputs,
  options: DetermineOwnerOptions = {},
): Promise<OwnerDecision> {
  const { app, bridge } = inputs;
  const now = options.now ?? (() => Date.now());
  const checkedAt = now();

  if (app.ownerModeBlockedReason !== null) {
    return unavailableDecision(app, app.ownerModeBlockedReason, checkedAt);
  }

  const account = await bridge.request<unknown>(
    'GET_USER_ACCOUNT',
    {},
    {
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    },
  );

  if (!account.ok) {
    return inconclusiveDecision(
      app,
      failureReason(account.error),
      `the current account could not be resolved: ${account.error.message}`,
      checkedAt,
    );
  }

  const address = readAddress(account.value);
  if (address === '') {
    return inconclusiveDecision(
      app,
      'malformed-response',
      'the host returned no account address',
      checkedAt,
    );
  }

  const names = await bridge.request<unknown>('GET_ACCOUNT_NAMES', { address });

  if (!names.ok) {
    return inconclusiveDecision(
      app,
      failureReason(names.error),
      `the account's name list could not be read: ${names.error.message}`,
      checkedAt,
      address,
    );
  }

  if (!Array.isArray(names.value)) {
    return inconclusiveDecision(
      app,
      'malformed-response',
      'the account name list was not an array',
      checkedAt,
      address,
    );
  }

  const extracted = extractNameList(names.value);

  return decideFromNames({
    publishingName: app.name,
    accountAddress: address,
    accountNames: extracted.names,
    service: app.service,
    context: app.context,
    checkedAt,
    ...(extracted.malformedEntries === 0 ? {} : { malformedEntries: extracted.malformedEntries }),
  });
}

/** True only for a confirmed membership decision. */
export function isOwnerDecision(decision: OwnerDecision | null): boolean {
  return decision?.status === 'owner';
}
