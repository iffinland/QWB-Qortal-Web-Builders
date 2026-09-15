/**
 * Phase gate.
 *
 * Phase 3 connects the accepted Phase 2 owner UI to real QDN-backed content:
 * bounded prefix discovery, an authoritative read path, publish/verify writes,
 * QDN media, tombstones and persistent ordering.
 *
 * The gate stays explicit so a build cannot silently drift back into a "looks
 * saved" state: `QDN_WRITE_ENABLED` is the single switch the flows read, and the
 * notices below are the exact words used when a surface cannot act.
 */

export const OWNER_PHASE = 3;

/** QDN publish/update/tombstone writes are enabled in this phase. */
export const QDN_WRITE_ENABLED = true;

export const WRITE_ENABLED_NOTICE =
  'Saving publishes to the Qortal Data Network under this site’s own name. Each save is a signed transaction: the host asks for approval, and Qortal charges the usual publish fee.';

export const WRITE_VERIFY_NOTE =
  'The change is only reported as published after the app has read the resource back and confirmed the new revision.';

/** Wording for media, which publishes first and is verified on its own. */
export const MEDIA_NOTICE =
  'A chosen image is downscaled in this browser and published as a QDN image resource under the item’s identifier, before the item itself.';

export const DELETE_ENABLED_NOTICE =
  'Deleting publishes a tombstone for the same identifier. The item disappears from the site, while the previously published bytes stay retrievable from the network — Qortal has no app-accessible QDN delete.';

export const REORDER_NOTICE =
  'Order is persisted by republishing the moved item with a new order value, verified by reading it back.';
