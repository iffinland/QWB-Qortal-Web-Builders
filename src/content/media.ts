/**
 * Image reference resolution.
 *
 * The approved rule (audit §6.3): an entity stores an explicit image reference,
 * and the display URL is derived at render time. QDN media is always requested
 * through an **absolute** `/arbitrary/<service>/<name>/<identifier>` path —
 * never a relative path, which would resolve against the frame's `<base href>`
 * and return the app shell HTML instead of the image.
 *
 * The path ends at the identifier. Media published by this app is a
 * **single-file** QDN resource, and Core (6.1.9) serves such a resource only at
 * `/arbitrary/<service>/<name>/<identifier>`:
 *
 *  - appending the stored filename is not a Core route at all — it answers the
 *    container's HTML 404 page (verified live 2026-09-16 against
 *    `qortal-6.1.9-108bf19`, node `127.0.0.1:24991`);
 *  - `?filepath=<stored filename>` is the *multi-file* lookup and is rejected for
 *    a single-file resource (`{"error":1401,"message":"No file exists at
 *    filepath: …"}`), because Core stores the bytes under its own name.
 *
 * `ImageRef.filename` therefore stays a record of what was published — it is what
 * the node derives the served MIME type from — and never becomes a URL segment.
 */

import type { ImageRef } from './schema';

export function isQdnAbsolutePath(href: string): boolean {
  return href.startsWith('/arbitrary/');
}

export function qdnMediaUrl(ref: Extract<ImageRef, { source: 'qdn' }>): string {
  return `/arbitrary/${ref.service}/${encodeURIComponent(ref.name)}/${ref.identifier}`;
}

export function resolveImageUrl(ref: ImageRef, placeholderFor: (label: string) => string): string {
  switch (ref.source) {
    case 'bundled':
      return ref.src;
    case 'qdn':
      return qdnMediaUrl(ref);
    case 'placeholder':
      return placeholderFor(ref.label);
  }
}
