/**
 * Owner console: create, edit, hide/show, reorder and delete content without
 * rebuilding the app.
 *
 * The console only exists for a verified owner (`main.ts` renders it on
 * `status === 'owner'`). Each entity is edited through plain form fields
 * (`owner/forms.ts`). Every write goes through `saveEntity`, which checks the
 * owner again, validates the schema, checks the revision and reads back the
 * published result.
 */

import type { ContentBundle, AnyEntity, CollectionKey, EntityKind } from '../content/schema';
import { COLLECTION_KINDS } from '../content/schema';
import { activeEntities, sortForDisplay } from '../content/repository';
import { newIdentifier, setHidden, swapOrder, tombstone } from '../content/edit';
import type { SaveDeps, SaveOutcome } from '../content/save';
import { saveEntity } from '../content/save';
import type { OwnerState } from '../qortal/owner';
import { escapeHtml } from '../ui/html';
import { FORM_FIELDS, fromValues, toValues } from './forms';
import type { FieldSpec, FormValues } from './forms';

type OwnerDeps = Omit<SaveDeps, 'owner'> & {
  readonly owner: Extract<OwnerState, { status: 'owner' }>;
};

export interface OwnerConsoleOptions {
  readonly raw: ContentBundle;
  readonly deps: OwnerDeps;
  /** Receives the updated raw bundle after each successful save. */
  readonly onRawChange: (raw: ContentBundle, notice: string) => void;
  readonly now?: () => number;
  readonly random?: () => string;
}

const COLLECTION_LABELS: Readonly<Record<CollectionKey, string>> = {
  services: 'Services',
  steps: 'How it works steps',
  works: 'Portfolio projects',
  prices: 'Pricing & quotes',
  articles: 'Articles',
};

const COLLECTION_ORDER: readonly CollectionKey[] = [
  'services',
  'works',
  'articles',
  'steps',
  'prices',
];

const KIND_LABELS: Readonly<Record<EntityKind, string>> = {
  site: 'Site texts and contact',
  service: 'Service',
  step: 'How it works step',
  work: 'Portfolio project',
  price: 'Pricing & quotes',
  article: 'Article',
};

/* ------------------------------------------------------------------------ */
/* Templates for new entities. Empty fields are reported by the form as      */
/* missing, so the owner sees exactly what to fill in.                        */
/* ------------------------------------------------------------------------ */

const TEMPLATE_PAYLOADS: Readonly<Record<EntityKind, Record<string, unknown>>> = {
  site: {},
  service: {
    summary: '',
    bullets: [''],
    icon: '✨',
  },
  step: {
    description: '',
    illustration: { source: 'placeholder', label: 'New step', alt: '' },
  },
  work: {
    slug: '',
    summary: '',
    description: [''],
    categories: [''],
    images: [{ source: 'placeholder', label: 'New project', alt: '' }],
    links: [{ label: 'Open the live website', href: 'qortal://WEBSITE/' }],
    featured: false,
  },
  price: {
    intro: '',
    lines: [{ icon: '✅', text: '' }],
    cta: { label: 'Request a free quote', href: 'qortal://APP/Q-Mail/to/Qortal20Web%20Builders' },
    note: '',
  },
  article: {
    slug: '',
    summary: '',
    heroImage: { source: 'placeholder', label: 'New article', alt: '' },
    blocks: [{ type: 'paragraph', text: '' }],
    tags: [],
  },
};

function defaultRandom(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

/* ------------------------------------------------------------------------ */
/* Rendering                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Adds an owner "Edit" button at the top of each public section. The button opens
 * the matching owner collection (or the site-text editor for hero/contact).
 * Owner-only: it is only called from main.ts when the owner state is `owner`.
 */
export function ownerSectionButtons(): Readonly<Record<string, { label: string; target: string }>> {
  return {
    hero: { label: 'Edit site texts', target: 'site' },
    contact: { label: 'Edit site texts', target: 'site' },
    services: { label: 'Edit services', target: 'services' },
    portfolio: { label: 'Edit portfolio', target: 'works' },
    'how-it-works': { label: 'Edit steps', target: 'steps' },
    pricing: { label: 'Edit pricing', target: 'prices' },
  };
}

export function renderOwnerConsole(
  raw: ContentBundle,
  owner: Extract<OwnerState, { status: 'owner' }>,
  notice = '',
): string {
  const sections = COLLECTION_ORDER.map((key) => renderCollection(key, raw[key])).join('\n');

  return `        <section class="owner-console section-padding" id="owner-console" aria-labelledby="owner-console-heading">
          <div class="container">
            <h2 id="owner-console-heading" class="section-title">Owner tools</h2>
            <p class="owner-meta">Signed in as <strong>${escapeHtml(owner.name)}</strong>. Visitors never see this panel.</p>
            <p class="owner-notice" role="status" aria-live="polite">${escapeHtml(notice)}</p>
            <div class="owner-site">
              <h3 class="section-heading">Site texts and contact</h3>
              <p class="owner-meta">Hero, contact details, footer and search description.</p>
              <button class="btn custom-btn" type="button" data-action="edit" data-collection="site" data-id="${escapeHtml(raw.site.id)}">Edit site texts</button>
            </div>
${sections}
            <form class="owner-editor" id="owner-editor" hidden aria-labelledby="owner-editor-heading">
              <h3 id="owner-editor-heading" class="section-heading">Edit</h3>
              <p class="owner-meta" data-editor-target></p>
              <div class="owner-fields" data-editor-fields></div>
              <div class="owner-actions">
                <button class="btn custom-btn" type="submit">Save and verify</button>
                <button class="btn custom-border-btn" type="button" data-action="cancel">Cancel</button>
              </div>
              <p class="owner-result" role="status" aria-live="polite"></p>
            </form>
          </div>
        </section>`;
}

function renderCollection(key: CollectionKey, entities: readonly AnyEntity[]): string {
  const items = sortForDisplay(entities)
    .map((entity, index, list) => renderItem(key, entity, index, list.length))
    .join('\n');
  return `            <div class="owner-collection" id="owner-collection-${key}">
              <h3 class="section-heading">${escapeHtml(COLLECTION_LABELS[key])}</h3>
              <button class="btn custom-btn" type="button" data-action="new" data-collection="${key}">Add new</button>
              <ul class="owner-list">
${items}
              </ul>
            </div>`;
}

function renderItem(key: CollectionKey, entity: AnyEntity, index: number, count: number): string {
  const badges = [
    entity.state === 'deleted' ? 'deleted' : '',
    entity.hidden ? 'hidden from visitors' : '',
    entity.kind === 'work' && entity.payload.featured ? 'featured' : '',
  ].filter((badge) => badge !== '');
  const live = entity.state === 'active';
  const disabled = (condition: boolean): string => (condition ? ' disabled' : '');

  return `                <li class="owner-item" data-collection="${key}" data-id="${escapeHtml(entity.id)}">
                  <div class="owner-item-title"><strong>${escapeHtml(entity.title)}</strong>
                    ${badges.map((badge) => `<span class="owner-badge">${escapeHtml(badge)}</span>`).join(' ')}
                    <span class="owner-meta">rev ${entity.rev}</span>
                  </div>
                  <div class="owner-actions">
                    <button class="btn custom-border-btn" type="button" data-action="edit" data-collection="${key}" data-id="${escapeHtml(entity.id)}"${disabled(!live)}>Edit</button>
                    <button class="btn custom-border-btn" type="button" data-action="toggle-hidden" data-collection="${key}" data-id="${escapeHtml(entity.id)}"${disabled(!live)}>${entity.hidden ? 'Show' : 'Hide'}</button>
                    <button class="btn custom-border-btn" type="button" data-action="up" data-collection="${key}" data-id="${escapeHtml(entity.id)}"${disabled(!live || index === 0)}>Move up</button>
                    <button class="btn custom-border-btn" type="button" data-action="down" data-collection="${key}" data-id="${escapeHtml(entity.id)}"${disabled(!live || index === count - 1)}>Move down</button>
                    <button class="btn custom-border-btn" type="button" data-action="delete" data-collection="${key}" data-id="${escapeHtml(entity.id)}"${disabled(!live)}>Delete</button>
                  </div>
                </li>`;
}

function renderField(spec: FieldSpec, value: string | boolean): string {
  const id = `owner-field-${spec.name}`;
  const help = spec.help ? `<small class="owner-meta">${escapeHtml(spec.help)}</small>` : '';
  if (spec.type === 'checkbox') {
    return `<div class="owner-field"><label><input type="checkbox" name="${spec.name}" id="${id}"${value === true ? ' checked' : ''}> ${escapeHtml(spec.label)}</label>${help}</div>`;
  }
  const text = typeof value === 'string' ? value : '';
  const label = `<label class="owner-label" for="${id}">${escapeHtml(spec.label)}</label>`;
  const control =
    spec.type === 'textarea'
      ? `<textarea id="${id}" name="${spec.name}" rows="${spec.rows ?? 3}">${escapeHtml(text)}</textarea>`
      : `<input type="text" id="${id}" name="${spec.name}" value="${escapeHtml(text)}">`;
  return `<div class="owner-field">${label}${control}${help}</div>`;
}

/* ------------------------------------------------------------------------ */
/* Behaviour                                                                 */
/* ------------------------------------------------------------------------ */

function findEntity(raw: ContentBundle, key: string, id: string): AnyEntity | undefined {
  if (key === 'site') return raw.site.id === id ? raw.site : undefined;
  const list = raw[key as CollectionKey] as readonly AnyEntity[];
  return list.find((entity) => entity.id === id);
}

function replaceEntity(raw: ContentBundle, key: string, next: AnyEntity): ContentBundle {
  if (key === 'site') return { ...raw, site: next as ContentBundle['site'] };
  const list = raw[key as CollectionKey] as readonly AnyEntity[];
  return { ...raw, [key]: list.map((entity) => (entity.id === next.id ? next : entity)) };
}

function describeOutcome(outcome: SaveOutcome): string {
  switch (outcome.status) {
    case 'saved':
      return `Saved to QDN and verified: "${outcome.entity.title}" is now revision ${outcome.entity.rev}.`;
    case 'unauthorized':
      return `Not saved: owner check failed (${outcome.reason}).`;
    case 'invalid':
      return `Not saved, please fix: ${outcome.errors.join('; ')}`;
    case 'conflict':
      return `Not saved, someone else changed this item: ${outcome.message}. Reload the page and try again.`;
    case 'read-failed':
      return `Not saved: the current version could not be read (${outcome.message}).`;
    case 'publish-failed':
      return `Not saved: the platform rejected the publish (${outcome.message}).`;
    case 'verification-failed':
      return `Published, but the read-back does not match: ${outcome.mismatches.slice(0, 5).join(', ')}. Reload before editing again.`;
  }
}

export function mountOwnerConsole(root: HTMLElement, options: OwnerConsoleOptions): () => void {
  const now = options.now ?? Date.now;
  const random = options.random ?? defaultRandom;
  const editor = root.querySelector<HTMLFormElement>('#owner-editor');
  const fieldsBox = root.querySelector<HTMLElement>('[data-editor-fields]');
  const target = root.querySelector<HTMLElement>('[data-editor-target]');
  const result = root.querySelector<HTMLElement>('.owner-result');
  if (editor === null || fieldsBox === null || target === null || result === null)
    return () => undefined;

  let raw = options.raw;
  let editing: { key: string; base: AnyEntity; expectedRev: number | null } | null = null;

  const openEditor = (
    key: string,
    base: AnyEntity,
    label: string,
    expectedRev: number | null,
  ): void => {
    editing = { key, base, expectedRev };
    const values = toValues(base);
    const fields = FORM_FIELDS[base.kind]
      .map((spec) => renderField(spec, values[spec.name] ?? ''))
      .join('\n');
    fieldsBox.innerHTML = fields;
    target.textContent = `${KIND_LABELS[base.kind]}: ${label}`;
    result.textContent = '';
    editor.hidden = false;
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    fieldsBox.querySelector<HTMLElement>('input, textarea')?.focus();
  };

  const closeEditor = (): void => {
    editing = null;
    editor.hidden = true;
    fieldsBox.innerHTML = '';
  };

  const readValues = (): FormValues => {
    const data = new FormData(editor);
    const values: Record<string, string | boolean> = {};
    for (const spec of editing ? FORM_FIELDS[editing.base.kind] : []) {
      if (spec.type === 'checkbox') values[spec.name] = data.get(spec.name) === 'on';
      else {
        const entry = data.get(spec.name);
        values[spec.name] = typeof entry === 'string' ? entry : '';
      }
    }
    return values;
  };

  const persist = async (
    key: string,
    candidate: AnyEntity,
    expectedRev: number | null,
  ): Promise<SaveOutcome> => {
    const outcome = await saveEntity(options.deps, candidate, expectedRev);
    if (outcome.status === 'saved') {
      raw = replaceEntity(raw, key, outcome.entity);
      options.onRawChange(raw, describeOutcome(outcome));
    }
    return outcome;
  };

  const onClick = async (event: Event): Promise<void> => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      'button[data-action]',
    );
    if (!button) return;
    const action = button.dataset.action;
    const key = button.dataset.collection ?? '';
    const id = button.dataset.id ?? null;

    if (action === 'cancel') {
      closeEditor();
      return;
    }

    if (action === 'new' && key in COLLECTION_KINDS) {
      const kind = COLLECTION_KINDS[key as CollectionKey];
      const stamp = now();
      const identifier = newIdentifier(kind, `new-${kind}`, stamp, random());
      const list = raw[key as CollectionKey] as readonly AnyEntity[];
      const order = list.reduce((max, entity) => Math.max(max, entity.order), 0) + 10;
      const template = {
        schema: 1,
        id: identifier,
        kind,
        rev: 0,
        state: 'active',
        hidden: false,
        createdAt: stamp,
        updatedAt: stamp,
        deletedAt: null,
        order,
        title: '',
        payload: TEMPLATE_PAYLOADS[kind],
      } as unknown as AnyEntity;
      openEditor(key, template, 'new item', null);
      return;
    }

    if (id === null) return;
    const entity = findEntity(raw, key, id);
    if (entity === undefined) {
      result.textContent = 'That item is no longer in the loaded content. Reload the page.';
      return;
    }

    if (action === 'edit') {
      openEditor(key, entity, `${entity.title} (revision ${entity.rev})`, entity.rev);
      return;
    }

    if (action === 'toggle-hidden') {
      const next = setHidden(entity, !entity.hidden, now());
      const outcome = await persist(key, next, entity.rev);
      result.textContent = describeOutcome(outcome);
      return;
    }

    if (action === 'delete') {
      if (
        !window.confirm(
          `Delete "${entity.title}" from the public site? The record is kept as a tombstone.`,
        )
      )
        return;
      const outcome = await persist(key, tombstone(entity, now()), entity.rev);
      result.textContent = describeOutcome(outcome);
      return;
    }

    if (action === 'up' || action === 'down') {
      const list = activeEntities(raw[key as CollectionKey] as readonly AnyEntity[]);
      const sorted = sortForDisplay(list);
      const index = sorted.findIndex((item) => item.id === id);
      const pair = swapOrder(sorted, index, action === 'up' ? 'up' : 'down', now());
      if (pair === null) return;
      const [first, second] = pair;
      const firstOutcome = await persist(key, first, sorted[index]?.rev ?? null);
      if (firstOutcome.status !== 'saved') {
        result.textContent = describeOutcome(firstOutcome);
        return;
      }
      const neighbour = sorted[action === 'up' ? index - 1 : index + 1];
      const secondOutcome = await persist(key, second, neighbour?.rev ?? null);
      result.textContent =
        secondOutcome.status === 'saved'
          ? 'Order updated and verified.'
          : describeOutcome(secondOutcome);
    }
  };

  const onSubmit = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (editing === null) return;
    const { key, base, expectedRev } = editing;
    const stamp = now();
    const built = fromValues(base, readValues(), stamp, expectedRev);
    if (!built.ok) {
      result.textContent = `Not saved, please fix: ${built.errors.join('; ')}`;
      return;
    }
    const outcome = await persist(key, built.entity, expectedRev);
    if (outcome.status === 'saved') {
      closeEditor();
      return;
    }
    result.textContent = describeOutcome(outcome);
  };

  const handleClick = (event: Event): void => {
    void onClick(event);
  };
  const handleSubmit = (event: Event): void => {
    void onSubmit(event);
  };
  root.addEventListener('click', handleClick);
  editor.addEventListener('submit', handleSubmit);
  return () => {
    root.removeEventListener('click', handleClick);
    editor.removeEventListener('submit', handleSubmit);
  };
}

/** Exposed for tests: the template a new entity of `kind` starts from. */
export function templateFor(kind: EntityKind): Record<string, unknown> {
  return TEMPLATE_PAYLOADS[kind];
}
