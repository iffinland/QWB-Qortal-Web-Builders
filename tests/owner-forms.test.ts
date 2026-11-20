import { describe, expect, it } from 'vitest';
import { resolvePublishingName } from '../src/config';
import { validateEntity } from '../src/content/schema';
import { seedBundle } from '../src/content/seed';
import { FORM_FIELDS, fromValues, toValues } from '../src/owner/forms';
import type { AnyEntity } from '../src/content/schema';

const STAMP = 1_800_000_000_000;

function sampleOf(kind: AnyEntity['kind']): AnyEntity {
  const bundle = seedBundle;
  if (kind === 'site') return bundle.site;
  const lists = {
    service: bundle.services,
    step: bundle.steps,
    work: bundle.works,
    price: bundle.prices,
    article: bundle.articles,
  } as const;
  const list: readonly AnyEntity[] = lists[kind];
  const first = list[0];
  if (first === undefined) throw new Error(`seed has no ${kind}`);
  return first;
}

describe('owner form model', () => {
  it('takes the publishing name from the WEBSITE render path only', () => {
    expect(resolvePublishingName('/render/WEBSITE/Qortal%20Web%20Builders/')).toBe(
      'Qortal Web Builders',
    );
    expect(resolvePublishingName('/render/WEBSITE/SomeOtherName/index.html')).toBe('SomeOtherName');
    expect(resolvePublishingName('/render/APP/x/')).toBe('x');
    expect(resolvePublishingName('/render/signature/abc')).toBeNull();
    expect(resolvePublishingName('/')).toBeNull();
    expect(resolvePublishingName('/render/WEBSITE/')).toBeNull();
  });

  it.each(['site', 'service', 'step', 'work', 'price', 'article'] as const)(
    'round-trips a seeded %s without losing data',
    (kind) => {
      const entity = sampleOf(kind);
      const values = toValues(entity);
      for (const spec of FORM_FIELDS[kind]) {
        expect(values).toHaveProperty(spec.name);
      }
      const result = fromValues(entity, values, STAMP, entity.rev);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.entity.rev).toBe(entity.rev + 1);
      expect(validateEntity(result.entity).ok).toBe(true);
      expect(toValues(result.entity)).toEqual(values);
    },
  );

  it('reports missing required fields in plain words', () => {
    const entity = sampleOf('work');
    const values = { ...toValues(entity), slug: '', images: '', links: '' };
    const result = fromValues(entity, values, STAMP, entity.rev);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('slug'),
        'Add at least one Qortal link.',
      ]),
    );
  });

  it('rejects unsafe link targets', () => {
    const entity = sampleOf('service');
    const values = { ...toValues(entity), cta: 'Click | javascript:alert(1)' };
    const result = fromValues(entity, values, STAMP, entity.rev);
    expect(result.ok).toBe(false);
  });

  it('parses article body lines into heading, bullet, note and paragraph blocks', () => {
    const entity = sampleOf('article');
    const values = {
      ...toValues(entity),
      body: '## Title\nFirst paragraph\n- one\n- two\n> remember this',
    };
    const result = fromValues(entity, values, STAMP, entity.rev);
    expect(result.ok).toBe(true);
    if (!result.ok || result.entity.kind !== 'article') return;
    expect(result.entity.payload.blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'bullets',
      'note',
    ]);
  });
});
