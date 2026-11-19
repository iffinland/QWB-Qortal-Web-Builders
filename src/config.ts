/**
 * Runtime configuration. Nothing here names a Qortal account or name.
 *
 * The publishing identity is the name in the URL the Qortal host renders the
 * site from: `/render/WEBSITE/<name>/…` (see Qortal Hub `appRenderUrl.ts` and Core
 * `RenderResource`). It is resolved at load time, so a copy of this build that is
 * published under another account reads, saves and owner-checks its own name.
 */

export const CONTENT_PREFIX = 'qwb_';

/** Upper bound on identifiers requested from a single QDN search. */
export const SEARCH_LIMIT = 500;

const RENDER_ROUTE = /^\/render\/(?:WEBSITE|APP)\/([^/]+)(?:\/|$)/;

/**
 * Returns the publishing name from a render path (WEBSITE or APP route), or `null`
 * when the page was not opened through a render route (signature/hash URLs, plain dev server).
 * `null` disables QDN reads for the owner tools and owner access (fail-closed).
 */
export function resolvePublishingName(pathname: string): string | null {
  const match = RENDER_ROUTE.exec(pathname);
  if (match === null) return null;
  const segment = match[1];
  if (segment === undefined) return null;
  let name: string;
  try {
    name = decodeURIComponent(segment).trim();
  } catch {
    return null;
  }
  return name === '' ? null : name;
}
