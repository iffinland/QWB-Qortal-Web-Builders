/**
 * Phase gate.
 *
 * Phase 2 ships the owner **shell**: recognition, the owner bar, inline
 * affordances, the form/modal plumbing and dirty-state UX. It ships **no** QDN
 * write, so every mutation affordance must say so explicitly. These constants
 * exist so no flow can be written that quietly implies a save.
 *
 * Phase 3 flips `QDN_WRITE_ENABLED` together with the publish/verify pipeline
 * (`src/qortal/write.ts`) and the QDN-backed `ContentSource`; the UI shells do
 * not change.
 */

export const OWNER_PHASE = 2;

/** No QDN publish/update/delete exists in this phase. */
export const QDN_WRITE_ENABLED = false;

export const WRITE_DISABLED_NOTICE =
  'Publishing is not enabled in this phase. Nothing you change here is saved or published — QDN persistence arrives in Phase 3.';

export const WRITE_DISABLED_SHORT = 'Not saved (Phase 3 adds publishing)';

export const DELETE_DISABLED_NOTICE =
  'Deleting is not enabled in this phase. Nothing was changed and nothing was removed from the network.';

export const REORDER_NOTICE =
  'Order changes are shown on this screen only. Nothing was saved or published — discard them when you are done.';

export const MEDIA_DISABLED_NOTICE =
  'Image publishing arrives with QDN media in Phase 3; the current image reference is shown read-only.';
