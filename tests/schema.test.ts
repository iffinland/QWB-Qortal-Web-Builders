import { describe, expect, it } from 'vitest';

import { seedBundle } from '../src/content/seed';
import {
  MAX_IDENTIFIER_LENGTH,
  SCHEMA_VERSION,
  identifierPrefixFor,
  isEntityKind,
  isValidIdentifier,
  validateBundle,
  validateEntity,
} from '../src/content/schema';
import type { SiteEntity } from '../src/content/schema';

describe('identifier policy', () => {
  it('maps every kind to its approved prefix', () => {
    expect(identifierPrefixFor('site')).toBe('qwb_site_');
    expect(identifierPrefixFor('highlight')).toBe('qwb_hl_');
    expect(identifierPrefixFor('service')).toBe('qwb_svc_');
    expect(identifierPrefixFor('step')).toBe('qwb_step_');
    expect(identifierPrefixFor('work')).toBe('qwb_work_');
    expect(identifierPrefixFor('price')).toBe('qwb_price_');
    expect(identifierPrefixFor('article')).toBe('qwb_post_');
  });

  it('rejects identifiers that break the character or length rule', () => {
    expect(isValidIdentifier('qwb_work_kaubamaja-2f19x7-k3')).toBe(true);
    expect(isValidIdentifier('qwb_work_Upper-Case')).toBe(false);
    expect(isValidIdentifier('qwb_work_has space')).toBe(false);
    expect(isValidIdentifier(`qwb_work_${'a'.repeat(MAX_IDENTIFIER_LENGTH)}`)).toBe(false);
  });

  it('recognises entity kinds only', () => {
    expect(isEntityKind('work')).toBe(true);
    expect(isEntityKind('gallery')).toBe(false);
    expect(isEntityKind(undefined)).toBe(false);
  });
});

describe('validateEntity', () => {
  it('accepts every seed entity', () => {
    const entities = [
      seedBundle.site,
      ...seedBundle.highlights,
      ...seedBundle.services,
      ...seedBundle.steps,
      ...seedBundle.works,
      ...seedBundle.prices,
      ...seedBundle.articles,
    ];

    for (const entity of entities) {
      const result = validateEntity(entity);
      expect(result.ok, `expected ${entity.id} to validate`).toBe(true);
    }
  });

  it('rejects an unknown schema version instead of rendering it', () => {
    const entity = { ...seedBundle.works[0], schema: SCHEMA_VERSION + 1 };
    const result = validateEntity(entity);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('schema');
  });

  it('rejects a mismatched identifier prefix', () => {
    const entity = { ...seedBundle.works[0], id: 'qwb_price_wrong-prefix' };
    const result = validateEntity(entity);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('qwb_work_');
  });

  it('rejects a malformed payload', () => {
    const broken = {
      ...seedBundle.works[0],
      payload: { ...seedBundle.works[0]!.payload, links: [], featured: 'yes' },
    };
    const result = validateEntity(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('featured');
    expect(result.errors.join(' ')).toContain('at least one link');
  });

  it('rejects a QDN image reference without a publishing name', () => {
    const broken = {
      ...seedBundle.works[0],
      payload: {
        ...seedBundle.works[0]!.payload,
        cover: { source: 'qdn', service: 'THUMBNAIL', identifier: 'x', filename: 'a.png', alt: '' },
      },
    };
    const result = validateEntity(broken);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('alt');
  });

  it('rejects a highlight with an unknown variant', () => {
    const broken = {
      ...seedBundle.highlights[0],
      payload: { ...seedBundle.highlights[0]!.payload, variant: 'fancy' },
    };
    const result = validateEntity(broken);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('variant');
  });
});

describe('site section validation', () => {
  it('accepts the seed sections, including the pane CTA', () => {
    const withCta = {
      ...seedBundle.site,
      payload: {
        ...seedBundle.site.payload,
        sections: [
          { id: 'section_1', label: 'Hero', visible: true },
          { id: 'section_2', label: 'Pane', visible: true, cta: { label: 'Go', href: '#/works' } },
        ],
      },
    };
    expect(validateEntity(withCta).ok).toBe(true);
  });

  it('rejects a malformed section instead of rendering it', () => {
    const bad = {
      ...seedBundle.site,
      payload: {
        ...seedBundle.site.payload,
        sections: [{ id: 'section_1', label: 'Hero', visible: true, cta: { label: 'Go' } }],
      },
    };
    const result = validateEntity(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('\n')).toContain('cta.href');
    }
  });
});

describe('validateBundle', () => {
  it('accepts the seed bundle and requires the site singleton', () => {
    expect(validateBundle(seedBundle).ok).toBe(true);

    const withoutSite = { ...seedBundle, site: undefined };
    const result = validateBundle(withoutSite);
    expect(result.ok).toBe(false);
  });

  it('reports a wrong kind inside a list', () => {
    const mixed = { ...seedBundle, works: [seedBundle.prices[0]] };
    const result = validateBundle(mixed);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('expected kind work');
  });

  it('keeps every seed identifier unique and inside the policy', () => {
    const ids = [
      seedBundle.site.id,
      ...seedBundle.highlights.map((entity) => entity.id),
      ...seedBundle.services.map((entity) => entity.id),
      ...seedBundle.steps.map((entity) => entity.id),
      ...seedBundle.works.map((entity) => entity.id),
      ...seedBundle.prices.map((entity) => entity.id),
      ...seedBundle.articles.map((entity) => entity.id),
    ];

    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(isValidIdentifier(id), id).toBe(true));
  });

  it('uses sparse ordering values', () => {
    const orders = seedBundle.works.map((work) => work.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(orders.every((order) => order % 10 === 0)).toBe(true);
  });

  it('carries the repositioned message and no legacy stock imagery', () => {
    const site: SiteEntity = seedBundle.site;
    const serialised = JSON.stringify(seedBundle);

    expect(site.payload.meta.description.toLowerCase()).toContain('custom qortal apps');
    expect(site.payload.nav).toHaveLength(4);
    expect(serialised).not.toContain('Builded to HTML Template');
    expect(serialised).not.toMatch(/\.(jpe?g)"/i);
    expect(serialised).not.toContain('qortal.org');
    expect(serialised).toContain('qortal://');
  });
});
