import { describe, expect, it } from 'vitest';

import { seedBundle } from '../src/content/seed';
import {
  MAX_IDENTIFIER_LENGTH,
  SCHEMA_VERSION,
  SECTION_IDS,
  identifierPrefixFor,
  isAllowedHref,
  isEntityKind,
  isValidIdentifier,
  isValidSlug,
  validateBundle,
  validateEntity,
} from '../src/content/schema';
import type { WorkEntity } from '../src/content/schema';
import { allSeedEntities } from './helpers';

function work(): WorkEntity {
  return seedBundle.works[0]!;
}

describe('identifier and kind policy', () => {
  it('maps every kind to its prefix and no longer knows the removed kinds', () => {
    expect(identifierPrefixFor('site')).toBe('qwb_site_');
    expect(identifierPrefixFor('service')).toBe('qwb_svc_');
    expect(identifierPrefixFor('work')).toBe('qwb_work_');
    expect(isEntityKind('highlight')).toBe(false);
    expect(isEntityKind('work')).toBe(true);
    expect(isEntityKind(undefined)).toBe(false);
  });

  it('enforces the character, length and slug rules', () => {
    expect(isValidIdentifier('qwb_work_asot-k3f9-d1')).toBe(true);
    expect(isValidIdentifier('qwb_work_Upper')).toBe(false);
    expect(isValidIdentifier(`qwb_work_${'a'.repeat(MAX_IDENTIFIER_LENGTH)}`)).toBe(false);
    expect(isValidSlug('asot-a-state-of-trance')).toBe(true);
    expect(isValidSlug('Bad Slug')).toBe(false);
    expect(isValidSlug('double--hyphen')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });

  it('allows only in-app hashes and Qortal deep links', () => {
    expect(isAllowedHref('#services')).toBe(true);
    expect(isAllowedHref('qortal://WEBSITE/Qortal%20Web%20Builders')).toBe(true);
    expect(isAllowedHref('https://example.org')).toBe(false);
    expect(isAllowedHref('javascript:alert(1)')).toBe(false);
  });
});

describe('validateEntity', () => {
  it('accepts every seed entity', () => {
    for (const entity of allSeedEntities()) {
      const result = validateEntity(entity);
      expect(result.ok, `${entity.id}: ${result.ok ? '' : result.errors.join(' | ')}`).toBe(true);
    }
  });

  it('rejects an unknown schema version instead of rendering it', () => {
    const result = validateEntity({ ...work(), schema: SCHEMA_VERSION + 1 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('schema');
  });

  it('rejects a mismatched identifier prefix', () => {
    const result = validateEntity({ ...work(), id: 'qwb_price_wrong-prefix' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('qwb_work_');
  });

  it('requires the owner-visibility flag', () => {
    const withoutFlag: Record<string, unknown> = { ...work() };
    delete withoutFlag.hidden;
    const result = validateEntity(withoutFlag);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('hidden');
  });

  it('rejects a malformed project payload with the failing path', () => {
    const broken = { ...work(), payload: { ...work().payload, links: [], featured: 'yes' } };
    const result = validateEntity(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('featured');
    expect(result.errors.join(' ')).toContain('links');
  });

  it('allows removing all project images and still requires a valid slug', () => {
    const noImages = { ...work(), payload: { ...work().payload, images: [] } };
    const badSlug = { ...work(), payload: { ...work().payload, slug: 'Not A Slug' } };
    expect(validateEntity(noImages).ok).toBe(true);
    expect(validateEntity(badSlug).ok).toBe(false);
  });

  it('refuses plain https links, which are dead inside a Qortal host', () => {
    const payload = { ...work().payload, links: [{ label: 'Site', href: 'https://example.org' }] };
    const result = validateEntity({ ...work(), payload });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('qortal://');
  });

  it('validates an optional video reference', () => {
    const withVideo = {
      ...work(),
      payload: {
        ...work().payload,
        video: { name: 'Qortal Web Builders', identifier: 'qwb_work_v-1', filename: '', title: '' },
      },
    };
    const result = validateEntity(withVideo);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('video.filename');
  });
});

describe('validateBundle', () => {
  it('accepts the seed bundle', () => {
    expect(validateBundle(seedBundle).ok).toBe(true);
  });

  it('keeps the one-page layout to exactly the six approved sections, in order', () => {
    expect(SECTION_IDS).toEqual([
      'hero',
      'services',
      'portfolio',
      'how-it-works',
      'pricing',
      'contact',
    ]);
    const reordered = {
      ...seedBundle,
      site: {
        ...seedBundle.site,
        payload: {
          ...seedBundle.site.payload,
          sections: [...seedBundle.site.payload.sections].reverse(),
        },
      },
    };
    const result = validateBundle(reordered);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('exactly');
  });

  it('rejects a duplicate project slug', () => {
    const first = seedBundle.works[0]!;
    const second = seedBundle.works[1]!;
    const duplicate = {
      ...seedBundle,
      works: [first, { ...second, payload: { ...second.payload, slug: first.payload.slug } }],
    };
    const result = validateBundle(duplicate);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('duplicate slug');
  });

  it('does not contain outdated prices or the removed template copy', () => {
    const text = JSON.stringify(seedBundle);
    expect(text).not.toMatch(/\d+\s*QORT/);
    expect(text).not.toContain('Builded to HTML Template');
    expect(text).not.toContain('QWBT-1');
  });
});
