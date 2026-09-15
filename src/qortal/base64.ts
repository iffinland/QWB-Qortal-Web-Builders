/**
 * base64 encoding for QDN publish payloads.
 *
 * The bridge accepts `data64` (base64 of the bytes to publish). The reference
 * app used `btoa(unescape(encodeURIComponent(…)))`, which is deprecated and
 * mangles anything outside Latin-1; this encodes UTF-8 bytes explicitly.
 *
 * `btoa` is used rather than a hand-rolled table because it is available in
 * every target (browser frame, jsdom test environment, Node 18+).
 */

/** Base64 of arbitrary bytes, chunked so the argument spread stays bounded. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

/** Base64 of the UTF-8 encoding of `text` (JSON payloads, media data URLs). */
export function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

/**
 * Canonicalizes a base64 string for comparison: whitespace and padding are
 * dropped and the URL-safe alphabet is mapped back to the standard one. The
 * mapping is injective on canonical base64, so it can never make two different
 * byte strings compare equal — it only stops a formatting difference from looking
 * like a content difference.
 */
export function normalizeBase64(value: string): string {
  return value.replace(/\s+/g, '').replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
}

/** The number of bytes a base64 string decodes to. */
export function base64ByteLength(value: string): number {
  return Math.floor((normalizeBase64(value).length * 3) / 4);
}

/** Drops a `data:<mime>;base64,` prefix if one is present. */
export function stripDataUrlPrefix(value: string): string {
  const comma = value.indexOf(',');
  if (value.startsWith('data:') && comma !== -1) return value.slice(comma + 1);
  return value;
}
