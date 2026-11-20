/** Resolved from the WEBSITE/APP publishing name at runtime, never the viewer. */
export const OWNER_QMAIL = 'qortal://APP/Q-Mail/to/@site-owner';

/** Includes legacy defaults so existing published content follows its publisher. */
export function normalizeContactLink(href: string, publishingName: string | null): string {
  const match = /^qortal:\/\/APP\/Q-Mail\/to\/[^/?#]+/i.exec(href);
  if (!match) return href;
  if (!publishingName?.trim()) return '#contact';
  return `qortal://APP/Q-Mail/to/${encodeURIComponent(publishingName)}${href.slice(match[0].length)}`;
}

/** Resolve only link destinations, retaining entity revisions and all other content. */
export function resolveOwnerContactLinks<T>(value: T, publishingName: string | null): T {
  const visit = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(visit);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).map(([key, child]) => [key,
        key === 'href' && typeof child === 'string' ? normalizeContactLink(child, publishingName) : visit(child),
      ]));
    }
    return item;
  };
  return visit(value) as T;
}
