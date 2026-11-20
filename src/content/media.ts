/**
 * Media reference resolution.
 *
 * An entity stores an explicit reference, and the display URL is derived at render
 * time. QDN media is always requested through an **absolute**
 * `/arbitrary/<service>/<name>/<identifier>/<file>` path. A relative path would
 * resolve against the frame's base and return the app shell instead of the file.
 */

import type { ImageRef, VideoRef } from './schema';

export function isQdnAbsolutePath(href: string): boolean {
  return href.startsWith('/arbitrary/');
}

export function qdnFileUrl(
  service: string,
  name: string,
  identifier: string,
  filename: string,
): string {
  void filename; // Kept in stored references as display metadata for compatibility.
  // IMAGE/VIDEO/THUMBNAIL publishes are raw single-file resources, not archives.
  // The selected device filename is metadata, not a path inside the resource.
  return `/arbitrary/${service}/${encodeURIComponent(name)}/${encodeURIComponent(identifier)}`;
}

export function qdnMediaUrl(ref: Extract<ImageRef, { source: 'qdn' }>): string {
  return qdnFileUrl(ref.service, ref.name, ref.identifier, ref.filename);
}

export function videoUrl(ref: VideoRef): string {
  return qdnFileUrl('VIDEO', ref.name, ref.identifier, ref.filename);
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
