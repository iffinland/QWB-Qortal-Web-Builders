import { describe, expect, it } from 'vitest';
import { normalizeContactLink, OWNER_QMAIL, resolveOwnerContactLinks } from '../src/content/contact-link';
import { seedBundle } from '../src/content/seed';
import { resolvePublishingName } from '../src/config';

describe('publisher Q-Mail recipient', () => {
  it('uses juku’s publishing name regardless of the old recipient', () => {
    const publisher = resolvePublishingName('/render/WEBSITE/juku/');
    for (const href of [OWNER_QMAIL, 'qortal://APP/Q-Mail/to/Qortal20Web%20Builders', 'qortal://APP/Q-Mail/to/Qortal%20Web%20Builders', 'qortal://APP/Q-Mail/to/malle']) {
      expect(normalizeContactLink(href, publisher)).toBe('qortal://APP/Q-Mail/to/juku');
    }
  });
  it('encodes the publishing name once and preserves subject parameters', () => {
    expect(normalizeContactLink(`${OWNER_QMAIL}?subject=Quote`, 'Jüri Web Builders')).toBe(
      `qortal://APP/Q-Mail/to/${encodeURIComponent('Jüri Web Builders')}?subject=Quote`,
    );
  });
  it('resolves nested contact rows without mutating stored content', () => {
    const resolved = resolveOwnerContactLinks(seedBundle, 'juku');
    expect(resolved.site.payload.hero.primaryCta.href).toBe('qortal://APP/Q-Mail/to/juku');
    expect(resolved.site.payload.contact.columns[0]!.rows[0]!.href).toBe('qortal://APP/Q-Mail/to/juku');
    expect(seedBundle.site.payload.hero.primaryCta.href).toBe(OWNER_QMAIL);
  });
  it('does not guess an owner outside Qortal or change non-mail links', () => {
    expect(normalizeContactLink(OWNER_QMAIL, null)).toBe('#contact');
    expect(normalizeContactLink('qortal://WEBSITE/Other', 'juku')).toBe('qortal://WEBSITE/Other');
  });
});
