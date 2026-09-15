/**
 * Image reference resolution.
 *
 * The approved rule (audit §6.3): an entity stores an explicit image reference,
 * and the display URL is derived at render time. QDN media is always requested
 * through an **absolute** `/arbitrary/<service>/<name>/<identifier>` path —
 * never a relative path, which would resolve against the frame's `<base href>`
 * and return the app shell HTML instead of the image.
 */

import type { ImageRef } from './schema';

export function isQdnAbsolutePath(href: string): boolean {
  return href.startsWith('/arbitrary/');
}

export function qdnMediaUrl(ref: Extract<ImageRef, { source: 'qdn' }>): string {
  return `/arbitrary/${ref.service}/${encodeURIComponent(ref.name)}/${ref.identifier}/${ref.filename}`;
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
