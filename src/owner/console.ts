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
import { COLLECTION_KINDS, validateEntity } from '../content/schema';
import { activeEntities, sortForDisplay } from '../content/repository';
import { newIdentifier, setHidden, swapOrder, tombstone } from '../content/edit';
import type { SaveDeps, SaveOutcome } from '../content/save';
import { saveEntity } from '../content/save';
import type { OwnerState } from '../qortal/owner';
import { escapeHtml } from '../ui/html';
import { FORM_FIELDS, fromValues, toValues } from './forms';
import type { FieldSpec, FormValues } from './forms';
import { structuredControl, structuredRow, syncStructured } from './controls';
import { OWNER_QMAIL, normalizeContactLink } from '../content/contact-link';
import { snapshotFile } from './file-snapshot';
import { richControl, syncRich, sanitizeRichText } from './rich-text';
import { qdnFileUrl } from '../content/media';
import { renderArticleBody } from '../views/article-body';
import { qdnAttributes } from '../ui/qdn-media';

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
  /** Seed entities have never existed remotely; their first edit is a create. */
  readonly unpublishedIds?: readonly string[];
  readonly onPublished?: (id: string) => void;
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
    illustration: { source: 'placeholder', label: 'New step', alt: 'Illustration for this step' },
  },
  work: {
    slug: '',
    summary: '',
    description: [''],
    categories: [''],
    images: [{ source: 'placeholder', label: 'New project', alt: 'Project image' }],
    links: [{ label: 'Open the live website', href: 'qortal://WEBSITE/' }],
    featured: false,
  },
  price: {
    intro: '',
    lines: [{ icon: '✅', text: '' }],
    cta: { label: 'Request a free quote', href: OWNER_QMAIL },
    note: '',
  },
  article: {
    slug: '',
    summary: '',
    heroImage: { source: 'placeholder', label: 'New article', alt: 'Article cover image' },
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
                <button class="btn custom-btn" type="submit">Save changes</button>
                <button class="btn custom-border-btn" type="button" data-action="cancel">Cancel</button>
              </div>
              <p class="owner-result" role="status" aria-live="polite"></p>
            </form>
          </div>
        </section>`;
}

/** A small mobile-first editor host. Inline buttons elsewhere in the page open it. */
export function renderOwnerEditorHost(notice = ''): string {
  return `        <div class="owner-editor-backdrop" id="owner-editor-host" hidden>
          <form class="owner-editor" id="owner-editor" aria-labelledby="owner-editor-heading">
            <div class="owner-editor-head">
              <h2 id="owner-editor-heading" class="section-heading">Edit content</h2>
              <button class="owner-editor-close" type="button" data-action="cancel" aria-label="Close editor">×</button>
            </div>
            <p class="owner-meta" data-editor-target></p>
            <div class="owner-fields" data-editor-fields></div>
            <div class="owner-actions">
              <button class="btn custom-btn" type="submit">Save changes</button>
              <button class="btn custom-border-btn" type="button" data-action="cancel">Cancel</button>
            </div>
            <p class="owner-result" role="status" aria-live="polite">${escapeHtml(notice)}</p>
          </form>
        </div>`;
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
  if (['description', 'summary', 'body', 'intro', 'note', 'heroSubtitle', 'contactIntro'].includes(spec.name)) {
    return richControl(spec.name, spec.label, typeof value === 'string' ? value : '');
  }
  const structured = structuredControl(spec.name, spec.label, typeof value === 'string' ? value : '');
  if (structured !== null) return structured;
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
  if (spec.media !== undefined) {
    const accept = spec.media === 'video' ? 'video/*' : spec.media === 'file' ? '*/*' : 'image/*';
    const multiple = spec.media === 'images' ? ' multiple' : '';
    return `<div class="owner-field owner-media-field">${label}
      <input class="owner-file-input" type="file" data-media-field="${spec.name}" data-media-kind="${spec.media}" accept="${accept}"${multiple}>
      <small class="owner-meta">Choose ${spec.media === 'video' ? 'a video' : spec.media === 'images' ? 'one or more images' : 'an image'} from this device. Leave empty to keep the current media.</small>
      <div class="owner-media-preview" data-media-preview="${spec.name}">${mediaPreview(text, spec.name, spec.media === 'video')}</div>
      <button type="button" class="owner-row-remove" data-media-remove="${spec.name}">Remove media</button>
      <button type="button" class="owner-row-add" data-media-undo="${spec.name}">Keep original media</button>
      <div hidden>${control}</div>
      <small class="owner-meta">${text ? 'Current media is kept until you choose a replacement.' : 'No media selected yet.'}</small>
    </div>`;
  }
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
  return { ...raw, [key]: list.some((entity) => entity.id === next.id)
    ? list.map((entity) => (entity.id === next.id ? next : entity)) : [...list, next] };
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
  const backdrop = root.querySelector<HTMLElement>('#owner-editor-host');
  const fieldsBox = root.querySelector<HTMLElement>('[data-editor-fields]');
  const target = root.querySelector<HTMLElement>('[data-editor-target]');
  const result = root.querySelector<HTMLElement>('.owner-result');
  if (editor === null || fieldsBox === null || target === null || result === null)
    return () => undefined;

  let raw = options.raw;
  let editing: { key: string; base: AnyEntity; expectedRev: number | null } | null = null;
  const selectedFiles = new Map<string, Promise<File[]>>();
  let saving = false;
  let richSelection: Range | null = null;
  const actionNotice = document.createElement('p');
  actionNotice.className = 'owner-action-notice';
  actionNotice.setAttribute('role', 'status');
  root.append(actionNotice);
  const previewUrls: string[] = [];
  const clearPreviews = (): void => { previewUrls.splice(0).forEach((url) => URL.revokeObjectURL(url)); };

  const openEditor = (
    key: string,
    base: AnyEntity,
    label: string,
    expectedRev: number | null,
  ): void => {
    editing = { key, base, expectedRev };
    clearPreviews();
    selectedFiles.clear();
    const values = toValues(base);
    for (const [field, value] of Object.entries(values)) {
      if (typeof value === 'string' && value.includes(OWNER_QMAIL)) {
        values[field] = value.replaceAll(OWNER_QMAIL, normalizeContactLink(OWNER_QMAIL, options.deps.name));
      }
    }
    const fields = FORM_FIELDS[base.kind]
      .map((spec) => renderField(spec, values[spec.name] ?? ''))
      .join('\n');
    fieldsBox.innerHTML = fields;
    for (const field of fieldsBox.querySelectorAll<HTMLElement>('[data-rich-field]')) {
      const storedHtml = base.richText?.[field.dataset.richField ?? ''];
      const richEditor = field.querySelector<HTMLElement>('[contenteditable]');
      if (storedHtml !== undefined && richEditor) richEditor.innerHTML = sanitizeRichText(storedHtml);
      else if (base.kind === 'article' && field.dataset.richField === 'body' && richEditor) {
        richEditor.innerHTML = sanitizeRichText(renderArticleBody(base.payload.blocks));
      }
    }
    const heading = root.querySelector('#owner-editor-heading');
    if (heading) heading.textContent = `${base.rev === 0 && base.title === '' ? 'Add' : 'Edit'} ${KIND_LABELS[base.kind].toLowerCase()}`;
    if (base.kind === 'site') {
      const groups: [string, string[]][] = [
        ['Brand and images', ['title', 'tagline', 'since', 'logo', 'mark']],
        ['Navigation and home sections', ['nav', 'sections']],
        ['Welcome section', ['heroHeading', 'heroSubtitle', 'heroPrimary', 'heroSecondary']],
        ['Contact', ['contactHeading', 'contactIntro', 'contactRows']],
        ['Footer', ['footerCredit', 'creditNote']],
        ['Search and browser title', ['metaTitle', 'metaDescription']],
      ];
      const remaining = new Set([...fieldsBox.children]);
      for (const [title, names] of groups) {
        const details = document.createElement('details');
        details.className = 'owner-field-group';
        const summary = document.createElement('summary');
        summary.textContent = title;
        details.append(summary);
        for (const child of [...remaining]) {
          if (names.some((name) => child.querySelector(`[name="${name}"]`))) {
            details.append(child);
            remaining.delete(child);
          }
        }
        fieldsBox.append(details);
      }
      const extra = document.createElement('details');
      extra.className = 'owner-field-group';
      extra.innerHTML = '<summary>Page headings and button labels</summary>';
      remaining.forEach((child) => extra.append(child));
      fieldsBox.append(extra);
    }
    target.textContent = `${KIND_LABELS[base.kind]}: ${label}`;
    result.textContent = '';
    editor.hidden = false;
    if (backdrop !== null) backdrop.hidden = false;
    document.body.classList.add('owner-editor-open');
    fieldsBox.querySelector<HTMLElement>('input, textarea')?.focus();
  };

  const closeEditor = (): void => {
    if (saving) return;
    clearPreviews();
    editing = null;
    editor.hidden = true;
    if (backdrop !== null) backdrop.hidden = true;
    document.body.classList.remove('owner-editor-open');
    fieldsBox.innerHTML = '';
  };

  const readValues = (): FormValues => {
    syncRich(editor);
    syncStructured(editor);
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
      options.onPublished?.(outcome.entity.id);
      options.onRawChange(raw, describeOutcome(outcome));
    }
    return outcome;
  };

  const onClick = async (event: Event): Promise<void> => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      'button[data-action]',
    );
    if (!button) return;
    if (saving) return;
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
      const unpublished = options.unpublishedIds?.includes(entity.id) ?? false;
      const editableBase = unpublished ? ({ ...entity, rev: 0 } as AnyEntity) : entity;
      openEditor(
        key,
        editableBase,
        unpublished ? `${entity.title} (first publish)` : `${entity.title} (revision ${entity.rev})`,
        unpublished ? null : entity.rev,
      );
      return;
    }

    if ((action === 'toggle-section' || action === 'toggle-footer') && entity.kind === 'site') {
      const sectionId = button.dataset.section;
      const expectedRev = options.unpublishedIds?.includes(entity.id) ? null : entity.rev;
      const candidate: AnyEntity = {
        ...entity, rev: (expectedRev ?? 0) + 1, updatedAt: now(),
        payload: { ...entity.payload,
          ...(action === 'toggle-footer' ? { footerVisible: entity.payload.footerVisible === false } : {}),
          sections: entity.payload.sections.map((section) =>
          section.id === sectionId ? { ...section, visible: !section.visible } : section,
        ) },
      };
      const outcome = await persist(key, candidate, expectedRev);
      actionNotice.textContent = describeOutcome(outcome);
      return;
    }

    if (action === 'toggle-hidden') {
      const next = setHidden(entity, !entity.hidden, now());
      const expectedRev = options.unpublishedIds?.includes(entity.id) ? null : entity.rev;
      const outcome = await persist(key, { ...next, rev: (expectedRev ?? 0) + 1 }, expectedRev);
      result.textContent = describeOutcome(outcome);
      actionNotice.textContent = describeOutcome(outcome);
      return;
    }

    if (action === 'delete') {
      if (
        !window.confirm(
          `Delete "${entity.title}" from the site? Use Hide instead if you want to show it again later.`,
        )
      )
        return;
      const expectedRev = options.unpublishedIds?.includes(entity.id) ? null : entity.rev;
      const outcome = await persist(key, { ...tombstone(entity, now()), rev: (expectedRev ?? 0) + 1 }, expectedRev);
      result.textContent = describeOutcome(outcome);
      actionNotice.textContent = describeOutcome(outcome);
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
    if (editing === null || saving) return;
    const { key, base, expectedRev } = editing;
    const stamp = now();
    let values = readValues();
    const preflight = fromValues(base, values, stamp, expectedRev);
    if (!preflight.ok) {
      result.textContent = `Not saved, please fix: ${preflight.errors.join('; ')}`;
      return;
    }
    const checked = validateEntity(preflight.entity);
    if (!checked.ok) {
      result.textContent = `Please complete the content before uploading: ${checked.errors.join('; ')}`;
      return;
    }
    const richSnapshot = syncRich(editor);
    try {
      values = await publishSelectedMedia(base, values, selectedFiles, options.deps);
      for (const field of selectedFiles.keys()) {
        const control = fieldsBox.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${field}"]`);
        const value = values[field];
        if (control && typeof value === 'string') control.value = value;
      }
      selectedFiles.clear();
    } catch (error) {
      result.textContent = `Media was not published: ${error instanceof Error ? error.message : 'unknown error'}`;
      return;
    }
    const built = fromValues(base, values, stamp, expectedRev);
    if (!built.ok) {
      result.textContent = `Not saved, please fix: ${built.errors.join('; ')}`;
      return;
    }
    const outcome = await persist(key, { ...built.entity, richText: { ...base.richText, ...richSnapshot } }, expectedRev);
    if (outcome.status === 'saved') {
      saving = false;
      closeEditor();
      return;
    }
    result.textContent = describeOutcome(outcome);
  };

  const handleClick = (event: Event): void => {
    const clicked = event.target as Element | null;
    const richButton = clicked?.closest<HTMLButtonElement>('[data-rich-command]');
    if (richButton) {
      const richEditor = richButton.closest('[data-rich-field]')?.querySelector<HTMLElement>('[contenteditable]');
      richEditor?.focus();
      const selection = window.getSelection();
      if (richSelection && richEditor?.contains(richSelection.commonAncestorContainer)) {
        selection?.removeAllRanges();
        selection?.addRange(richSelection);
      }
      const command = richButton.dataset.richCommand ?? '';
      document.execCommand(command, false, command === 'formatBlock' ? 'h2' : undefined);
      return;
    }
    const linkButton = clicked?.closest('[data-rich-link]');
    if (linkButton) {
      const field = linkButton.closest('[data-rich-field]');
      const input = field?.querySelector<HTMLInputElement>('[data-rich-url]');
      const richEditor = field?.querySelector<HTMLElement>('[contenteditable]');
      const href = input?.value.trim() ?? '';
      if (!/^(?:qortal:\/\/|https?:\/\/|#)/i.test(href)) {
        result.textContent = 'Enter a qortal://, https:// or # link.';
        return;
      }
      richEditor?.focus();
      const selection = window.getSelection();
      if (richSelection && richEditor?.contains(richSelection.commonAncestorContainer)) {
        selection?.removeAllRanges();
        selection?.addRange(richSelection);
      }
      if (selection?.isCollapsed) document.execCommand('insertText', false, href);
      document.execCommand('createLink', false, href);
      if (input) input.value = '';
      return;
    }
    const mediaRemove = clicked?.closest<HTMLButtonElement>('[data-media-remove]');
    const mediaUndo = clicked?.closest<HTMLButtonElement>('[data-media-undo]');
    const removeItem = clicked?.closest<HTMLButtonElement>('[data-media-remove-item]');
    if (removeItem && !saving) {
      const field = removeItem.dataset.mediaRemoveItem ?? '';
      const row = removeItem.closest<HTMLElement>('.owner-media-item');
      const preview = row?.parentElement;
      if (row && preview) {
        const index = [...preview.children].indexOf(row);
        const stored = fieldsBox.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${field}"]`);
        if (selectedFiles.has(field)) {
          const pending = selectedFiles.get(field)!;
          selectedFiles.set(field, pending.then((files) => files.filter((_, position) => position !== index)));
        } else if (stored) {
          const lines = stored.value.split('\n').filter((line) => line.trim());
          lines.splice(index, 1);
          stored.value = lines.join('\n') || (field === 'images' || field === 'video' ? '' : 'placeholder | No image | No image');
        }
        row.remove();
      }
      return;
    }
    if ((mediaRemove || mediaUndo) && !saving) {
      const field = mediaRemove?.dataset.mediaRemove ?? mediaUndo?.dataset.mediaUndo ?? '';
      selectedFiles.delete(field);
      const input = fieldsBox.querySelector<HTMLInputElement>(`[data-media-field="${field}"]`);
      if (input) input.value = '';
      const stored = fieldsBox.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${field}"]`);
      if (stored && editing) stored.value = mediaUndo ? String(toValues(editing.base)[field] ?? '')
        : field === 'video' || field === 'images' ? '' : 'placeholder | No image | No image';
      const preview = fieldsBox.querySelector<HTMLElement>(`[data-media-preview="${field}"]`);
      if (preview) {
        if (mediaUndo && stored) preview.innerHTML = mediaPreview(stored.value, field, field === 'video');
        else preview.textContent = 'Media removed. Save changes to apply.';
      }
      return;
    }
    const add = clicked?.closest('[data-row-add]');
    const remove = clicked?.closest('[data-row-remove]');
    if (add) {
      const group = add.closest<HTMLElement>('[data-structured]');
      group?.querySelector('[data-rows]')?.insertAdjacentHTML('beforeend', structuredRow(group.dataset.structured ?? ''));
      return;
    }
    if (remove) {
      remove.closest('.owner-structured-row')?.remove();
      return;
    }
    const operation = onClick(event);
    const action = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (['delete', 'toggle-hidden', 'toggle-section', 'toggle-footer'].includes(action ?? '')) {
      saving = true;
      actionNotice.textContent = 'Saving…';
      void operation.catch((error: unknown) => {
        actionNotice.textContent = error instanceof Error ? error.message : 'Unable to save.';
      }).finally(() => {
        saving = false;
        if (actionNotice.textContent === 'Saving…') actionNotice.textContent = '';
      });
    }
  };
  const handleSubmit = (event: Event): void => {
    if (saving) { event.preventDefault(); return; }
    const promise = onSubmit(event);
    saving = true;
    fieldsBox.inert = true;
    const submit = editor.querySelector<HTMLButtonElement>('[type="submit"]');
    if (submit) { submit.disabled = true; submit.textContent = 'Saving…'; }
    void promise.catch((error: unknown) => {
      result.textContent = error instanceof Error ? error.message : 'Unable to save. Please try again.';
    }).finally(() => {
      saving = false;
      fieldsBox.inert = false;
      if (submit) { submit.disabled = false; submit.textContent = 'Save changes'; }
    });
  };
  const handleChange = (event: Event): void => {
    const input = event.target as HTMLInputElement | null;
    const field = input?.dataset.mediaField;
    if (!field || input?.files === null) return;
    const files = [...input.files];
    const kind = input.dataset.mediaKind;
    const max = kind === 'video' ? 200 * 1024 * 1024 : 10 * 1024 * 1024;
    const oversized = files.find((file) => file.size > max);
    if (oversized) {
      result.textContent = `${oversized.name} is too large. Maximum: ${kind === 'video' ? '200 MB' : '10 MB'}.`;
      input.value = '';
      return;
    }
    const prepared = Promise.all(files.map(snapshotFile));
    selectedFiles.set(field, prepared);
    result.textContent = 'Preparing media…';
    void prepared.then(() => {
      if (selectedFiles.get(field) === prepared) result.textContent = 'Media ready to publish.';
    }).catch((error: unknown) => {
      if (selectedFiles.get(field) === prepared) {
        result.textContent = error instanceof Error ? error.message : 'Unable to read media. Choose it again.';
      }
    });
    const preview = root.querySelector<HTMLElement>(`[data-media-preview="${field}"]`);
    if (preview !== null) {
      preview.replaceChildren();
      for (const file of files) {
        const url = URL.createObjectURL(file);
        previewUrls.push(url);
        const media = document.createElement(kind === 'video' ? 'video' : 'img');
        media.src = url;
        if (media instanceof HTMLVideoElement) media.controls = true;
        else media.alt = file.name;
        const caption = document.createElement('span');
        caption.textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
        const row = document.createElement('div');
        row.className = 'owner-media-item';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'owner-row-remove';
        remove.dataset.mediaRemoveItem = field;
        remove.textContent = 'Remove';
        row.append(media, caption, remove);
        preview.append(row);
      }
    }
  };
  root.addEventListener('click', handleClick);
  const rememberSelection = (): void => {
    const selection = window.getSelection();
    if (selection?.rangeCount && fieldsBox.contains(selection.anchorNode)) {
      const node = selection.anchorNode?.parentElement?.closest('[contenteditable]');
      if (node) richSelection = selection.getRangeAt(0).cloneRange();
    }
  };
  document.addEventListener('selectionchange', rememberSelection);
  root.addEventListener('change', handleChange);
  editor.addEventListener('submit', handleSubmit);
  return () => {
    clearPreviews();
    actionNotice.remove();
    document.removeEventListener('selectionchange', rememberSelection);
    root.removeEventListener('click', handleClick);
    root.removeEventListener('change', handleChange);
    editor.removeEventListener('submit', handleSubmit);
  };
}

function mediaIdentifier(entityId: string, field: string, index: number): string {
  const suffix = `_${field}_${index + 1}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return `${entityId.slice(0, Math.max(1, 60 - suffix.length))}${suffix}`;
}

function mediaPreview(text: string, field: string, video: boolean): string {
  return text.split('\n').filter((line) => line.trim()).map((line) => {
    const parts = line.split('|').map((part) => part.trim());
    const url = parts[0] === 'bundled' ? parts[1] : parts[0] === 'qdn'
      ? qdnFileUrl(video ? 'VIDEO' : 'IMAGE', parts[1] ?? '', parts[2] ?? '', parts[3] ?? '') : '';
    const label = parts[0] === 'qdn' ? parts[3] : parts[0] === 'placeholder' ? parts[1] : 'Current image';
    const attributes = parts[0] === 'qdn' ? qdnAttributes(video ? 'VIDEO' : 'IMAGE', parts[1] ?? '', parts[2] ?? '') : '';
    return `<div class="owner-media-item">${url ? video
      ? `<video controls preload="metadata" src="${escapeHtml(url)}" ${attributes}></video>`
      : `<img src="${escapeHtml(url)}" alt="Current image" ${attributes}>` : ''}
      <span>${escapeHtml(label ?? 'Media')}</span>
      <button type="button" class="owner-row-remove" data-media-remove-item="${field}">Remove</button></div>`;
  }).join('');
}

async function publishSelectedMedia(
  base: AnyEntity,
  values: FormValues,
  selected: ReadonlyMap<string, Promise<File[]>>,
  deps: OwnerDeps,
): Promise<FormValues> {
  if (selected.size === 0) return values;
  if (deps.writer.publishFile === undefined) throw new Error('Qortal file publishing is unavailable.');
  const next: Record<string, string | boolean> = { ...values };
  for (const [field, pending] of selected) {
    const files = await pending;
    const spec = FORM_FIELDS[base.kind].find((item) => item.name === field);
    if (spec?.media === undefined || files.length === 0) continue;
    const lines: string[] = [];
    for (const [index, file] of files.entries()) {
      const identifier = mediaIdentifier(base.id, `${Date.now().toString(36)}_${field}`, index);
      const service = spec.media === 'video' ? 'VIDEO' : 'IMAGE';
      await deps.writer.publishFile({
        name: deps.name,
        service,
        identifier,
        title: `${base.title || file.name} – ${field}`,
        file,
      });
      lines.push(
        spec.media === 'video'
          ? `qdn | ${deps.name} | ${identifier} | ${file.name} | ${base.title || file.name}`
          : `qdn | ${deps.name} | ${identifier} | ${file.name} | ${base.title || file.name}`,
      );
    }
    next[field] = spec.media === 'images' ? lines.join('\n') : (lines[0] ?? '');
  }
  return next;
}

/** Exposed for tests: the template a new entity of `kind` starts from. */
export function templateFor(kind: EntityKind): Record<string, unknown> {
  return TEMPLATE_PAYLOADS[kind];
}
