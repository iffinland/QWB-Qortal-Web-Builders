/**
 * Phase-1 placeholder covers.
 *
 * The published site shipped eight 1920x1080 project screenshots (6.6 MB, 74 %
 * of the payload). They are not carried into the app bundle: project previews
 * become QDN-managed media (`THUMBNAIL`) in Phase 2-3, and unknown-provenance
 * stock imagery is explicitly not carried forward.
 *
 * Until then a work card renders a deterministic, on-brand placeholder that
 * keeps the card anatomy (full-width image cropped to 200 px) intact. It is a
 * `data:` URI, which the production render CSP allows for `img-src`.
 */

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Builds a deterministic placeholder cover as an SVG data URI. */
export function placeholderCover(label: string): string {
  const hash = hashString(label);
  const circleY = 150 + (hash % 220);
  const circleX = 760 + (hash % 300);
  const radius = 120 + (hash % 90);
  const title = escapeXml(truncate(label, 42));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="1200" height="675" role="img">
<defs>
<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="27%">
<stop offset="0%" stop-color="#13547a"/>
<stop offset="100%" stop-color="#80d0c7"/>
</linearGradient>
</defs>
<rect width="1200" height="675" fill="url(#g)"/>
<circle cx="${circleX}" cy="${circleY}" r="${radius}" fill="#ffffff" fill-opacity="0.12"/>
<circle cx="${circleX - 150}" cy="${circleY + 190}" r="${Math.round(radius * 0.6)}" fill="#ffffff" fill-opacity="0.1"/>
<g stroke="#ffffff" stroke-opacity="0.16" stroke-width="2">
<path d="M0 470 L1200 250"/><path d="M0 520 L1200 300"/><path d="M0 570 L1200 350"/>
</g>
<text x="70" y="110" font-family="Montserrat, 'Open Sans', sans-serif" font-size="34" font-weight="700" fill="#ffffff" fill-opacity="0.85" letter-spacing="3">QWB</text>
<text x="70" y="560" font-family="Montserrat, 'Open Sans', sans-serif" font-size="46" font-weight="700" fill="#ffffff">${title}</text>
<text x="70" y="610" font-family="'Open Sans', sans-serif" font-size="26" fill="#ffffff" fill-opacity="0.8">Preview coming soon</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
