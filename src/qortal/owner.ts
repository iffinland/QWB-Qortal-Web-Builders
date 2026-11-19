/**
 * Owner recognition.
 *
 * The owner is the Qortal account that owns the configured owner name. The check
 * is fail-closed: any missing piece (no bridge, no account, no configured name,
 * an unregistered name, an owner mismatch, a failed lookup) yields `visitor`.
 * Public visitors therefore never see write controls and never need to log in.
 *
 * The same rule that `useAuth.ts` in qapp-core applies is used: the connected
 * account's address must equal the owner address of the registered name.
 */

import type { QortalBridge } from './adapter';

export type OwnerState =
  | { readonly status: 'owner'; readonly name: string; readonly address: string }
  | { readonly status: 'visitor'; readonly reason: VisitorReason };

export type VisitorReason =
  | 'publishing-name-unknown'
  | 'no-qortal-bridge'
  | 'no-account'
  | 'owner-name-unregistered'
  | 'not-owner'
  | 'check-failed';

export interface OwnerLookup {
  /**
   * The publishing name taken from the render URL. `null` (no WEBSITE render route)
   * disables owner tools.
   */
  readonly ownerName: string | null;
  readonly bridge: QortalBridge | null;
  /** Returns the owner address of a registered name, or null when unregistered. */
  readonly nameOwner: (name: string) => Promise<string | null>;
}

/** Names held by the connected account, as the Qortal host reports them. */
export async function accountNamesFromBridge(
  bridge: QortalBridge,
  address: string,
): Promise<string[]> {
  const response = await bridge.request({
    action: 'GET_ACCOUNT_NAMES',
    address,
    limit: 100,
    offset: 0,
    reverse: false,
  });
  if (!Array.isArray(response)) return [];
  return response
    .map((entry: unknown) =>
      typeof entry === 'string'
        ? entry
        : typeof entry === 'object' && entry !== null && 'name' in entry
          ? String(entry.name)
          : '',
    )
    .filter((name) => name !== '');
}

export async function resolveOwner(lookup: OwnerLookup): Promise<OwnerState> {
  const ownerName = (lookup.ownerName ?? '').trim();
  if (ownerName === '') return { status: 'visitor', reason: 'publishing-name-unknown' };
  if (lookup.bridge === null) return { status: 'visitor', reason: 'no-qortal-bridge' };

  try {
    const account = await lookup.bridge.request({ action: 'GET_USER_ACCOUNT' });
    const address =
      typeof account === 'object' && account !== null && 'address' in account
        ? account.address
        : undefined;
    if (typeof address !== 'string' || address === '') {
      return { status: 'visitor', reason: 'no-account' };
    }

    // Owner = the connected account owns the publishing name. Checked against the
    // account's own name list first, then against the registered owner of the name.
    const held = await accountNamesFromBridge(lookup.bridge, address).catch(() => [] as string[]);
    const holdsName = held.some((name) => name.trim().toLowerCase() === ownerName.toLowerCase());
    if (holdsName) return { status: 'owner', name: ownerName, address };

    const registeredOwner = await lookup.nameOwner(ownerName);
    if (registeredOwner === null) return { status: 'visitor', reason: 'owner-name-unregistered' };
    if (registeredOwner !== address) return { status: 'visitor', reason: 'not-owner' };

    return { status: 'owner', name: ownerName, address };
  } catch {
    return { status: 'visitor', reason: 'check-failed' };
  }
}

export function isOwner(state: OwnerState): state is Extract<OwnerState, { status: 'owner' }> {
  return state.status === 'owner';
}

export const VISITOR_REASON_TEXT: Readonly<Record<VisitorReason, string>> = {
  'publishing-name-unknown': 'Open this site through its Qortal render address to edit it.',
  'no-qortal-bridge': 'Open this site inside Qortal to sign in as the owner.',
  'no-account': 'No Qortal account is connected.',
  'owner-name-unregistered': 'The configured owner name is not registered.',
  'not-owner': 'The connected account is not the owner of this site.',
  'check-failed': 'The owner check could not be completed.',
};
