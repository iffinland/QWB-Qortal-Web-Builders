/**
 * Small rendering helpers.
 *
 * All view modules build HTML strings. Every value that comes from content is
 * escaped here, and only hrefs with a known-safe scheme become real links:
 * in-app hash routes (`#…`) and Qortal deep links (`qortal://…`).
 */

import type { Inline } from '../content/schema';
import { isAllowedHref } from '../content/schema';

const ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] ?? char);
}

/** Only hash routes and qortal:// deep links are renderable as links. */
export function isSafeHref(href: string): boolean {
  return isAllowedHref(href);
}

export function renderInline(segments: Inline): string {
  return segments
    .map((segment) => {
      const text = escapeHtml(segment.text);
      const href = segment.href;
      if (href === undefined || !isSafeHref(href)) return text;
      return `<a href="${escapeHtml(href)}">${text}</a>`;
    })
    .join('');
}

export function classNames(...values: readonly (string | false | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}
