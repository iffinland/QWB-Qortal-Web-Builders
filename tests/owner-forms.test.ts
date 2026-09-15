import { describe, expect, it } from 'vitest';

import {
  assembleDraft,
  defaultValuesForKind,
  fieldsForKind,
  fieldsForSiteSlice,
  nextOrder,
  readFormValues,
  valuesForEntity,
} from '../src/owner/fields';
import { renderFormBody } from '../src/owner/forms';
import { loadContent } from './support/owner';
import { validateEntity } from '../src/content/schema';
import { generateIdentifier } from '../src/content/identifier';
import type { AnyEntity, EntityKind } from '../src/content/schema';

const KINDS: readonly EntityKind[] = ['highlight', 'service', 'step', 'work', 'price', 'article'];

function entityOfKind(
  kind: EntityKind,
  content: Awaited<ReturnType<typeof loadContent>>,
): AnyEntity {
  switch (kind) {
    case 'highlight':
      return content.highlights[0] as AnyEntity;
    case 'service':
      return content.services[0] as AnyEntity;
    case 'step':
      return content.steps[0] as AnyEntity;
    case 'work':
      return content.works[0] as AnyEntity;
    case 'price':
      return content.prices[0] as AnyEntity;
    case 'article':
      return content.articles[0] as AnyEntity;
    case 'site':
      return content.site;
  }
}

describe('field descriptors', () => {
  it('describes every entity kind without a write-only field', () => {
    for (const kind of KINDS) {
      const fields = fieldsForKind(kind);
      expect(fields.length, kind).toBeGreaterThan(1);
      for (const field of fields) {
        expect(field.label.length, `${kind}.${field.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('covers every site slice the owner bar can open', () => {
    for (const slice of ['hero', 'brand', 'contact', 'footer'] as const) {
      expect(fieldsForSiteSlice(slice).length).toBeGreaterThan(0);
    }
  });
});

describe('form values', () => {
  it('pre-fills every kind from the current seed entity', async () => {
    const content = await loadContent();
    for (const kind of KINDS) {
      const entity = entityOfKind(kind, content);
      const values = valuesForEntity(entity);
      const fields = fieldsForKind(kind);
      const names = fields
        .filter((field) => field.type !== 'image' && field.type !== 'readonly')
        .map((field) => field.name);
      for (const name of names) {
        expect(values[name], `${kind}.${name}`).toBeDefined();
      }
      expect(values.title).toBe(entity.title);
    }
  });

  it('defaults a create form so a filled form is publishable', async () => {
    const content = await loadContent();
    for (const kind of KINDS) {
      const values = defaultValuesForKind(kind, content.site);
      const assembly = assembleDraft({
        kind,
        values,
        original: null,
        site: content.site,
        id: generateIdentifier(kind, 'candidate', { now: 1, random: () => 0.4 }),
        order: 10,
        now: 1,
      });
      expect(assembly.ok, `${kind}: ${assembly.ok ? '' : assembly.errors.join('; ')}`).toBe(true);
    }
  });
});

describe('draft assembly', () => {
  it('bumps rev, keeps identity and clears deletedAt on edit', async () => {
    const content = await loadContent();
    const original = content.works[0] as AnyEntity;
    const values = { ...valuesForEntity(original), title: 'Renamed project' };

    const assembly = assembleDraft({
      kind: 'work',
      values,
      original,
      site: content.site,
      id: original.id,
      order: original.order,
      now: 42,
    });

    expect(assembly.ok).toBe(true);
    if (!assembly.ok) return;
    expect(assembly.entity.id).toBe(original.id);
    expect(assembly.entity.rev).toBe(original.rev + 1);
    expect(assembly.entity.createdAt).toBe(original.createdAt);
    expect(assembly.entity.updatedAt).toBe(42);
    expect(assembly.entity.deletedAt).toBeNull();
    expect(assembly.entity.state).toBe('active');
    expect(validateEntity(assembly.entity).ok).toBe(true);
  });

  it('rejects a draft that would break the schema contract', async () => {
    const content = await loadContent();
    const original = content.works[0] as AnyEntity;

    const assembly = assembleDraft({
      kind: 'work',
      values: { ...valuesForEntity(original), links: 'a link without a target' },
      original,
      site: content.site,
      id: original.id,
      order: original.order,
      now: 1,
    });

    expect(assembly.ok).toBe(false);
    if (assembly.ok) return;
    expect(assembly.errors.join(' ')).toContain('label | target');
  });

  it('preserves the site tabs, nav and section order when editing one slice', async () => {
    const content = await loadContent();
    const values = { ...valuesForEntity(content.site), 'hero.heading': 'New headline' };

    const assembly = assembleDraft({
      kind: 'site',
      values,
      original: content.site,
      site: content.site,
      id: content.site.id,
      order: content.site.order,
      now: 7,
    });

    expect(assembly.ok).toBe(true);
    if (!assembly.ok || assembly.entity.kind !== 'site') return;
    expect(assembly.entity.payload.hero.heading).toBe('New headline');
    expect(assembly.entity.payload.nav).toEqual(content.site.payload.nav);
    expect(assembly.entity.payload.sections).toEqual(content.site.payload.sections);
    expect(assembly.entity.payload.tabs).toEqual(content.site.payload.tabs);
    expect(assembly.entity.payload.footer.credit).toEqual(content.site.payload.footer.credit);
  });

  it('round-trips the footer credit line segments through the form', async () => {
    const content = await loadContent();
    const values = valuesForEntity(content.site);
    const assembly = assembleDraft({
      kind: 'site',
      values,
      original: content.site,
      site: content.site,
      id: content.site.id,
      order: content.site.order,
      now: 1,
    });

    expect(assembly.ok).toBe(true);
    if (!assembly.ok || assembly.entity.kind !== 'site') return;
    expect(assembly.entity.payload.footer.credit).toEqual(content.site.payload.footer.credit);
  });

  it('keeps a step illustration and an article body that the form cannot edit yet', async () => {
    const content = await loadContent();
    const step = content.steps[0];
    const article = content.articles[0];
    if (step === undefined || article === undefined) throw new Error('missing seed entities');

    const stepDraft = assembleDraft({
      kind: 'step',
      values: valuesForEntity(step),
      original: step,
      site: content.site,
      id: step.id,
      order: step.order,
      now: 1,
    });
    const articleDraft = assembleDraft({
      kind: 'article',
      values: valuesForEntity(article),
      original: article,
      site: content.site,
      id: article.id,
      order: article.order,
      now: 1,
    });

    expect(stepDraft.ok).toBe(true);
    expect(articleDraft.ok).toBe(true);
    if (!stepDraft.ok || stepDraft.entity.kind !== 'step') return;
    if (!articleDraft.ok || articleDraft.entity.kind !== 'article') return;
    expect(stepDraft.entity.payload.illustration).toEqual(step.payload.illustration);
    expect(articleDraft.entity.payload.blocks).toEqual(article.payload.blocks);
  });
});

describe('form rendering', () => {
  it('escapes content-derived values and never emits the write notice as HTML', async () => {
    const content = await loadContent();
    const original = content.highlights[0] as AnyEntity;
    const html = renderFormBody({
      fields: fieldsForKind('highlight'),
      values: { ...valuesForEntity(original), title: '"><script>alert(1)</script>' },
      title: 'Edit featured card',
      subtitle: 'subtitle',
      noticeHtml: 'notice',
      primaryLabel: 'Save & publish',
      primaryDisabled: true,
      primaryDisabledReason: 'disabled in this phase',
      secondaryLabel: 'Validate draft',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
    expect(html).toContain('disabled');
  });

  it('renders the media affordance as disabled with an explanation', async () => {
    const html = renderFormBody({
      fields: fieldsForKind('work'),
      values: defaultValuesForKind('work', (await loadContent()).site),
      title: 'New project',
      subtitle: 'subtitle',
      primaryLabel: 'Save & publish',
      primaryDisabled: true,
    });

    expect(html).toContain('data-qwb-media-replace');
    expect(html).toMatch(/data-qwb-media-replace[^>]*disabled/);
    expect(html).toContain('Phase 3');
  });
});

describe('readFormValues', () => {
  it('reads text, textarea, select and checkbox controls by descriptor name', async () => {
    const content = await loadContent();
    const entity = content.highlights[0] as AnyEntity;
    const fields = fieldsForKind('highlight');
    const form = document.createElement('form');
    form.innerHTML = renderFormBody({
      fields,
      values: valuesForEntity(entity),
      title: 't',
      subtitle: 's',
      primaryLabel: 'p',
      primaryDisabled: true,
    });
    document.body.append(form);

    const values = readFormValues(form, fields);

    expect(values.title).toBe(entity.title);
    expect(values.variant).toBe('plain');
    expect(values['cta.href']).toBeDefined();
    expect(values.illustration).toBeUndefined();
    form.remove();
  });
});

describe('nextOrder', () => {
  it('leaves a gap after the highest existing order', async () => {
    const content = await loadContent();
    const orders = content.works.map((work) => work.order);

    expect(nextOrder(content.works)).toBe(Math.max(...orders) + 10);
    expect(nextOrder([])).toBe(10);
  });
});
