/**
 * Field descriptors and draft assembly for the owner forms.
 *
 * One descriptor list per entity kind drives both the rendered form and the
 * draft that Phase 3 will publish. The descriptor is the contract; the form
 * renderer (`forms.ts`) and the assembler below are two consumers of it.
 *
 * Assembly is deliberately explicit per kind rather than a generic
 * path-writer: a typed object literal per payload is what keeps the written
 * resource shape identical to the shape the views read (`AnyEntity`), which the
 * assembler proves by running the same `validateEntity()` the read path uses.
 */

import type {
  AnyEntity,
  ArticleBlock,
  ArticlePayload,
  ContentBundle,
  EntityKind,
  HighlightPayload,
  ImageRef,
  Inline,
  InlineSegment,
  LinkRef,
  PricePayload,
  ServicePayload,
  SitePayload,
  StepPayload,
  WorkPayload,
} from '../content/schema';
import { SCHEMA_VERSION, validateEntity } from '../content/schema';
import type { SiteSlice } from './targets';

export type FieldType =
  'text' | 'textarea' | 'lines' | 'pairs' | 'blocks' | 'boolean' | 'select' | 'image' | 'readonly';

/** Line-format markers of the structured article body editor (`parseBlocks`). */
export const BLOCK_MARKERS = {
  heading: '## ',
  bullet: '- ',
  /** A further inline run of the bullet above (see `blocksToValue`). */
  bulletRun: '+ ',
  note: '> ',
  noteAction: '>> ',
} as const;

export interface FieldOption {
  readonly value: string;
  readonly label: string;
}

export interface FieldDescriptor {
  readonly name: string;
  readonly label: string;
  readonly type: FieldType;
  readonly help?: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly rows?: number;
  readonly options?: readonly FieldOption[];
  readonly fullWidth?: boolean;
}

export type FormValues = Readonly<Record<string, string>>;

/* -------------------------------------------------------------------------- */
/* Descriptors                                                                */
/* -------------------------------------------------------------------------- */

const LINK_LABEL_MAX = 60;
const LINK_HREF_MAX = 300;

const IMAGE_FIELD = (name: string, label: string, help: string): FieldDescriptor => ({
  name,
  label,
  type: 'image',
  help,
});

/**
 * The article body is authored as text and stored as the typed block model, so
 * the renderer keeps escaping its own output and no HTML ever becomes content:
 *
 * ```
 *   ## A heading          heading block
 *   - a bullet            one bullets block for consecutive `- ` lines
 *   - link bullet | #/x   bullet with a link target
 *   > a note              note block
 *   >> label | href       optional action on the preceding note
 *   anything else         paragraph
 * ```
 */
const BLOCKS_HELP =
  'One block per line: “## ” heading, “- ” bullet (add “ | target” for a link; a bullet showing several links keeps one “+ ” line per extra link run), “> ” note (add a “>> label | target” line for its action), any other line is a paragraph.';

export function fieldsForKind(kind: EntityKind): readonly FieldDescriptor[] {
  switch (kind) {
    case 'highlight':
      return [
        { name: 'title', label: 'Title', type: 'text', maxLength: 80 },
        { name: 'body', label: 'Question line', type: 'text', maxLength: 120 },
        { name: 'bullets', label: 'Bullet lines', type: 'lines', help: 'One bullet per line.' },
        {
          name: 'variant',
          label: 'Card variant',
          type: 'select',
          options: [
            { value: 'plain', label: 'Plain (white card)' },
            { value: 'overlay', label: 'Overlay (gradient card)' },
          ],
        },
        { name: 'cta.label', label: 'Button label', type: 'text', maxLength: LINK_LABEL_MAX },
        {
          name: 'cta.href',
          label: 'Button target',
          type: 'text',
          maxLength: LINK_HREF_MAX,
          help: 'In-app route (#/works) or a qortal:// deep link.',
        },
      ];
    case 'service':
      return [
        { name: 'title', label: 'Service name', type: 'text', maxLength: 80 },
        { name: 'summary', label: 'One-line summary', type: 'text', maxLength: 200 },
        { name: 'icon', label: 'Icon', type: 'text', maxLength: 4, help: 'A single emoji.' },
        { name: 'bullets', label: 'Detail lines', type: 'lines', help: 'One line per detail.' },
        { name: 'link.label', label: 'Link label', type: 'text', maxLength: LINK_LABEL_MAX },
        { name: 'link.href', label: 'Link target', type: 'text', maxLength: LINK_HREF_MAX },
      ];
    case 'step':
      return [
        { name: 'title', label: 'Step title', type: 'text', maxLength: 80 },
        { name: 'description', label: 'Description', type: 'textarea', rows: 3, maxLength: 400 },
        IMAGE_FIELD(
          'illustration',
          'Illustration',
          'The current image stays unless you choose a new file; a new image is published to QDN before this item.',
        ),
        { name: 'illustration.alt', label: 'Image alt text', type: 'text', maxLength: 160 },
        { name: 'link.label', label: 'Link label', type: 'text', maxLength: LINK_LABEL_MAX },
        { name: 'link.href', label: 'Link target', type: 'text', maxLength: LINK_HREF_MAX },
      ];
    case 'work':
      return [
        { name: 'title', label: 'Project title', type: 'text', maxLength: 80 },
        { name: 'buildKind', label: 'Build kind', type: 'text', maxLength: 60 },
        { name: 'summary', label: 'Summary', type: 'textarea', rows: 3, maxLength: 400 },
        {
          name: 'links',
          label: 'Project links',
          type: 'pairs',
          help: 'One per line as: label | target. The first link is the card button.',
        },
        { name: 'featured', label: 'Featured on the home page', type: 'boolean' },
        IMAGE_FIELD(
          'cover',
          'Cover image',
          'The current image stays unless you choose a new file; a new image is published to QDN before this item.',
        ),
        { name: 'cover.alt', label: 'Cover alt text', type: 'text', maxLength: 160 },
      ];
    case 'price':
      return [
        { name: 'title', label: 'Tier title', type: 'text', maxLength: 80 },
        {
          name: 'lines',
          label: 'Included lines',
          type: 'pairs',
          help: 'One per line as: icon | text.',
        },
        { name: 'note', label: 'Note', type: 'text', maxLength: 200 },
        { name: 'cta.label', label: 'Order button label', type: 'text', maxLength: LINK_LABEL_MAX },
        { name: 'cta.href', label: 'Order button target', type: 'text', maxLength: LINK_HREF_MAX },
      ];
    case 'article':
      return [
        { name: 'title', label: 'Title', type: 'text', maxLength: 120 },
        {
          name: 'slug',
          label: 'Route slug',
          type: 'text',
          maxLength: 60,
          help: 'Lowercase [a-z0-9-]; the article is reachable at #/post/<slug>.',
        },
        { name: 'summary', label: 'Summary', type: 'textarea', rows: 3, maxLength: 400 },
        { name: 'tags', label: 'Tags', type: 'lines', help: 'One tag per line.' },
        IMAGE_FIELD(
          'heroImage',
          'Hero image',
          'The current image stays unless you choose a new file; a new image is published to QDN before this item.',
        ),
        { name: 'heroImage.alt', label: 'Hero alt text', type: 'text', maxLength: 160 },
        {
          name: 'blocks',
          label: 'Article body',
          type: 'blocks',
          rows: 12,
          help: BLOCKS_HELP,
        },
      ];
    // Site editing is exposed per slice (`fieldsForSiteSlice`); the `site`
    // singleton has no single-form descriptor.
    case 'site':
      return fieldsForSiteSlice('hero');
  }
}

export function fieldsForSiteSlice(slice: SiteSlice): readonly FieldDescriptor[] {
  switch (slice) {
    case 'hero':
      return [
        { name: 'hero.heading', label: 'Headline', type: 'text', maxLength: 120, fullWidth: true },
        {
          name: 'hero.subtitle',
          label: 'Subtitle',
          type: 'textarea',
          rows: 3,
          maxLength: 400,
          fullWidth: true,
        },
      ];
    case 'brand':
      return [
        { name: 'title', label: 'Site title', type: 'text', maxLength: 120 },
        { name: 'brand.name', label: 'Navbar wordmark', type: 'text', maxLength: 120 },
        { name: 'brand.tagline', label: 'Tagline', type: 'text', maxLength: 200 },
      ];
    case 'contact':
      return [
        { name: 'contact.heading', label: 'Contact heading', type: 'text', maxLength: 120 },
        {
          name: 'contact.rows',
          label: 'Contact rows',
          type: 'pairs',
          help: 'One per line as: label | value | target. Editing these arrives in Phase 3.',
        },
      ];
    case 'footer':
      return [
        {
          name: 'footer.credit',
          label: 'Credit line',
          type: 'lines',
          help: 'One segment per line as: text | target (target optional).',
        },
        { name: 'footer.creditNote', label: 'Credit note', type: 'text', maxLength: 200 },
      ];
  }
}

export function siteSliceTitle(slice: SiteSlice): string {
  switch (slice) {
    case 'hero':
      return 'hero band';
    case 'brand':
      return 'site identity';
    case 'contact':
      return 'contact block';
    case 'footer':
      return 'footer';
  }
}

/* -------------------------------------------------------------------------- */
/* Values                                                                     */
/* -------------------------------------------------------------------------- */

function linkToValues(prefix: string, link: LinkRef | undefined): Record<string, string> {
  return {
    [`${prefix}.label`]: link?.label ?? '',
    [`${prefix}.href`]: link?.href ?? '',
  };
}

function linesToValue(values: readonly string[]): string {
  return values.join('\n');
}

function inlineToValue(inline: Inline): string {
  return inline
    .map((segment) =>
      segment.href === undefined ? segment.text : `${segment.text} | ${segment.href}`,
    )
    .join('\n');
}

function imageSummary(ref: ImageRef): string {
  switch (ref.source) {
    case 'bundled':
      return `bundled asset: ${ref.src}`;
    case 'qdn':
      return `QDN ${ref.service}: ${ref.name}/${ref.identifier}`;
    case 'placeholder':
      return `placeholder cover: ${ref.label}`;
  }
}

/** Seeds a form with the entity's current values (create forms get defaults). */
export function valuesForEntity(entity: AnyEntity): FormValues {
  const base: Record<string, string> = { title: entity.title };

  switch (entity.kind) {
    case 'site':
      return {
        ...base,
        'brand.name': entity.payload.brand.name,
        'brand.tagline': entity.payload.brand.tagline,
        'hero.heading': entity.payload.hero.heading,
        'hero.subtitle': entity.payload.hero.subtitle,
        'contact.heading': entity.payload.contact.heading,
        'contact.rows': entity.payload.contact.columns
          .flatMap((column) =>
            column.rows.map((row) => `${row.label} | ${row.value} | ${row.href}`),
          )
          .join('\n'),
        'footer.credit': inlineToValue(entity.payload.footer.credit),
        'footer.creditNote': entity.payload.footer.creditNote,
      };
    case 'highlight':
      return {
        ...base,
        body: entity.payload.body,
        bullets: linesToValue(entity.payload.bullets),
        variant: entity.payload.variant,
        ...linkToValues('cta', entity.payload.cta),
      };
    case 'service':
      return {
        ...base,
        summary: entity.payload.summary,
        icon: entity.payload.icon,
        bullets: linesToValue(entity.payload.bullets),
        ...linkToValues('link', entity.payload.link),
      };
    case 'step':
      return {
        ...base,
        description: entity.payload.description,
        illustration: imageSummary(entity.payload.illustration),
        'illustration.alt': entity.payload.illustration.alt,
        ...linkToValues('link', entity.payload.link),
      };
    case 'work':
      return {
        ...base,
        buildKind: entity.payload.buildKind,
        summary: entity.payload.summary,
        links: linesToValue(entity.payload.links.map((link) => `${link.label} | ${link.href}`)),
        featured: String(entity.payload.featured),
        cover: imageSummary(entity.payload.cover),
        'cover.alt': entity.payload.cover.alt,
      };
    case 'price':
      return {
        ...base,
        lines: linesToValue(entity.payload.lines.map((line) => `${line.icon} | ${line.text}`)),
        note: entity.payload.note,
        ...linkToValues('cta', entity.payload.cta),
      };
    case 'article':
      return {
        ...base,
        slug: entity.payload.slug,
        summary: entity.payload.summary,
        tags: linesToValue(entity.payload.tags),
        heroImage: imageSummary(entity.payload.heroImage),
        'heroImage.alt': entity.payload.heroImage.alt,
        blocks: blocksToValue(entity.payload.blocks),
      };
  }
}

/** Values a create form starts from (visible as defaults, not as invented data). */
export function defaultValuesForKind(kind: EntityKind, site: ContentBundle['site']): FormValues {
  switch (kind) {
    case 'highlight':
      return {
        title: 'New featured card',
        body: 'Why work with us?',
        bullets: 'Individually designed\nBuilt on Qortal',
        variant: 'plain',
        'cta.label': 'Read more',
        'cta.href': '#/works',
      };
    case 'service':
      return {
        title: 'Custom Qortal app',
        summary: 'A Qortal application built around one specific job.',
        icon: '🧩',
        bullets: 'Custom functions\nOn-chain identity',
        'link.label': 'See our work',
        'link.href': '#/works',
      };
    case 'step':
      return {
        title: 'New step',
        description: 'Describe what happens in this step of the process.',
        illustration: 'placeholder cover: New step',
        'illustration.alt': 'Illustration for the new step',
        'link.label': 'Read more',
        'link.href': '#/posts',
      };
    case 'work':
      return {
        title: 'New project',
        buildKind: 'Custom website',
        summary: 'What the project is and what was built for it.',
        links: 'Open project | #/works',
        featured: 'false',
        cover: 'placeholder cover: New project',
        'cover.alt': 'Cover image for the new project',
      };
    case 'price':
      return {
        title: 'New tier',
        lines: '✅ | What is included',
        note: 'Short note about this tier.',
        'cta.label': 'Order now',
        'cta.href': '#/',
      };
    case 'article':
      return {
        title: 'New article',
        slug: 'new-article',
        summary: 'One-sentence summary of the article.',
        tags: 'design',
        heroImage: 'placeholder cover: New article',
        'heroImage.alt': 'Cover image for the new article',
        blocks:
          'A short introduction to the article.\n## What this covers\n- the first point\n- the second point',
      };
    case 'site':
      return valuesForEntity(site);
  }
}

/* -------------------------------------------------------------------------- */
/* Reading + assembly                                                         */
/* -------------------------------------------------------------------------- */

export function readFormValues(
  form: HTMLFormElement,
  fields: readonly FieldDescriptor[],
): Record<string, string> {
  const values: Record<string, string> = {};

  for (const field of fields) {
    if (field.type === 'image' || field.type === 'readonly') continue;
    const element = form.elements.namedItem(field.name);
    if (element instanceof HTMLInputElement) {
      values[field.name] = element.type === 'checkbox' ? String(element.checked) : element.value;
    } else if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      values[field.name] = element.value;
    }
  }

  return values;
}

function splitLines(value: string): readonly string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * A `text | target` line is only split when the part after the **last** `|`
 * actually looks like a link target. Copy such as the footer credit
 * (`"… does not use cookies |¤| Design: …"`) contains pipe characters of its
 * own, and splitting on the first pipe would silently rewrite those segments.
 */
function looksLikeTarget(value: string): boolean {
  return value.startsWith('#') || value.startsWith('/') || /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function splitTail(value: string): { readonly head: string; readonly tail: string } {
  const separator = value.lastIndexOf('|');
  if (separator === -1) return { head: value.trim(), tail: '' };
  const tail = value.slice(separator + 1).trim();
  if (!looksLikeTarget(tail)) return { head: value.trim(), tail: '' };
  return { head: value.slice(0, separator).trim(), tail };
}

/** `label | target` pairs (project links). */
function splitLinkPairs(value: string): readonly (readonly [string, string])[] {
  return splitLines(value).map((line) => {
    const { head, tail } = splitTail(line);
    return [head, tail] as const;
  });
}

/** `icon | text` pairs, where the text may itself contain a pipe. */
function splitIconPairs(value: string): readonly (readonly [string, string])[] {
  return splitLines(value).map((line) => {
    const separator = line.indexOf('|');
    if (separator === -1) return [line, ''] as const;
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] as const;
  });
}

/**
 * Inline runs keep their own spacing: the footer credit concatenates segments, so
 * trimming one would join two words on the rendered page. Only the part after a
 * recognised target separator is trimmed (that space is the one the writer adds).
 */
function parseInlineSegments(value: string): Inline {
  return value
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const separator = line.lastIndexOf('|');
      if (separator === -1) return { text: line };
      const tail = line.slice(separator + 1).trim();
      if (!looksLikeTarget(tail)) return { text: line };
      return { text: line.slice(0, separator).trim(), href: tail };
    });
}

/* -------------------------------------------------------------------------- */
/* Article body <-> text                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The text after `marker`, taken from the **untrimmed** line so whitespace inside
 * a run survives. `String.trim()` is exactly what would corrupt a run that ends in
 * a space.
 */
function runAfterMarker(raw: string, marker: string): string {
  const start = raw.indexOf(marker);
  return start === -1 ? '' : raw.slice(start + marker.length);
}

/**
 * One bullet line as **one** inline run, preserving the run's text exactly.
 *
 * Whitespace is significant here: `renderInline` concatenates the runs of a
 * bullet, and the seed body depends on it (“…through ” followed by a linked
 * “Q-Mail”). Only the single space the writer inserts around the `|` separator
 * is removed, which is exactly reversible for any run text.
 *
 * The residual ambiguity is a plain-text run that itself ends with ` | <target>`;
 * that is read as a link, as the editor format documents.
 */
function runFromLine(text: string): InlineSegment {
  const separator = text.lastIndexOf('|');
  if (separator === -1) return { text };
  const href = text.slice(separator + 1).replace(/^\s+/, '');
  if (!looksLikeTarget(href)) return { text };
  const head = text.slice(0, separator).replace(/ $/, '');
  return head === '' ? { text: href } : { text: head, href };
}

/** `Inline` is a readonly array: a continuation run extends the item it belongs to. */
function withRun(item: Inline, run: InlineSegment): Inline {
  return [...item, run];
}

/**
 * Parses the article body text into the typed block model. Malformed input is a
 * field error, never a silently dropped block.
 */
export function parseBlocks(value: string, errors?: { list: string[] }): readonly ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  let bullets: Inline[] = [];

  const flush = (): void => {
    if (bullets.length > 0) {
      blocks.push({ type: 'bullets', items: bullets });
      bullets = [];
    }
  };

  for (const raw of value.split('\n')) {
    const line = raw.trim();
    if (line === '') {
      flush();
      continue;
    }
    if (line.startsWith(BLOCK_MARKERS.noteAction)) {
      const previous = blocks[blocks.length - 1];
      const body = line.slice(BLOCK_MARKERS.noteAction.length).trim();
      const separator = body.lastIndexOf('|');
      if (previous === undefined || previous.type !== 'note' || separator === -1) {
        errors?.list.push(
          `Article body: “${BLOCK_MARKERS.noteAction.trim()}” must follow a note and read “label | target”`,
        );
        continue;
      }
      const label = body.slice(0, separator).trim();
      const href = body.slice(separator + 1).trim();
      if (label === '' || href === '') {
        errors?.list.push('Article body: the note action needs both a label and a target');
        continue;
      }
      blocks[blocks.length - 1] = { ...previous, action: { label, href } };
      continue;
    }
    if (line.startsWith(BLOCK_MARKERS.heading)) {
      flush();
      const text = line.slice(BLOCK_MARKERS.heading.length).trim();
      if (text === '') errors?.list.push('Article body: a heading needs text');
      else blocks.push({ type: 'heading', text });
      continue;
    }
    if (line.startsWith(BLOCK_MARKERS.bulletRun)) {
      // A further run of the bullet above: everything after the marker is literal.
      const previous = bullets[bullets.length - 1];
      if (previous === undefined) {
        errors?.list.push(
          `Article body: “${BLOCK_MARKERS.bulletRun.trim()}” must follow a “${BLOCK_MARKERS.bullet.trim()}” bullet`,
        );
        continue;
      }
      bullets[bullets.length - 1] = withRun(
        previous,
        runFromLine(runAfterMarker(raw, BLOCK_MARKERS.bulletRun)),
      );
      continue;
    }
    if (line.startsWith(BLOCK_MARKERS.bullet)) {
      const run = runFromLine(runAfterMarker(raw, BLOCK_MARKERS.bullet).replace(/^\s+/, ''));
      if (run.text === '') errors?.list.push('Article body: a bullet needs text');
      else bullets.push([run]);
      continue;
    }
    if (line.startsWith(BLOCK_MARKERS.note)) {
      flush();
      const text = line.slice(BLOCK_MARKERS.note.length).trim();
      if (text === '') errors?.list.push('Article body: a note needs text');
      else blocks.push({ type: 'note', text });
      continue;
    }
    flush();
    blocks.push({ type: 'paragraph', text: line });
  }
  flush();

  if (blocks.length === 0) errors?.list.push('Article body: at least one block is required');
  return blocks;
}

/** Renders the block model back into the editor text (round-trips `parseBlocks`). */
export function blocksToValue(blocks: readonly ArticleBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'paragraph':
          return block.text;
        case 'heading':
          return `${BLOCK_MARKERS.heading}${block.text}`;
        case 'bullets':
          // One line per run: concatenating the runs onto one line would make every
          // ` | ` separator indistinguishable from link syntax.
          return block.items
            .map((item) =>
              item
                .map(
                  (segment, index) =>
                    `${index === 0 ? BLOCK_MARKERS.bullet : BLOCK_MARKERS.bulletRun}${segment.text}${
                      segment.href === undefined ? '' : ` | ${segment.href}`
                    }`,
                )
                .join('\n'),
            )
            .join('\n');
        case 'note':
          return block.action === undefined
            ? `${BLOCK_MARKERS.note}${block.text}`
            : `${BLOCK_MARKERS.note}${block.text}\n${BLOCK_MARKERS.noteAction}${block.action.label} | ${block.action.href}`;
      }
    })
    .join('\n');
}

function pairsToLinks(pairs: readonly (readonly [string, string])[]): readonly LinkRef[] {
  return pairs
    .filter(([label, href]) => label !== '' || href !== '')
    .map(([label, href]) => ({ label, href }));
}

function pairsToPriceLines(pairs: readonly (readonly [string, string])[]): PricePayload['lines'] {
  return pairs.filter(([, text]) => text !== '').map(([icon, text]) => ({ icon, text }));
}

class FieldErrors {
  public readonly list: string[] = [];

  public require(value: string, label: string, maxLength: number): string {
    const trimmed = value.trim();
    if (trimmed === '') this.list.push(`${label}: required`);
    else if (trimmed.length > maxLength) {
      this.list.push(`${label}: at most ${String(maxLength)} characters`);
    }
    return trimmed;
  }

  public optional(value: string, label: string, maxLength: number): string {
    const trimmed = value.trim();
    if (trimmed.length > maxLength)
      this.list.push(`${label}: at most ${String(maxLength)} characters`);
    return trimmed;
  }
}

function optionalLink(
  errors: FieldErrors,
  values: FormValues,
  prefix: string,
  label: string,
): LinkRef | undefined {
  const linkLabel = errors.optional(
    values[`${prefix}.label`] ?? '',
    `${label} label`,
    LINK_LABEL_MAX,
  );
  const href = errors.optional(values[`${prefix}.href`] ?? '', `${label} target`, LINK_HREF_MAX);
  if (linkLabel === '' && href === '') return undefined;
  if (linkLabel === '') errors.require(linkLabel, `${label} label`, LINK_LABEL_MAX);
  if (href === '') errors.require(href, `${label} target`, LINK_HREF_MAX);
  return { label: linkLabel, href };
}

function requiredLink(
  errors: FieldErrors,
  values: FormValues,
  prefix: string,
  label: string,
): LinkRef {
  return {
    label: errors.require(values[`${prefix}.label`] ?? '', `${label} label`, LINK_LABEL_MAX),
    href: errors.require(values[`${prefix}.href`] ?? '', `${label} target`, LINK_HREF_MAX),
  };
}

function altEnabledImage(
  original: ImageRef | undefined,
  fallback: ImageRef,
  alt: string,
): ImageRef {
  const base = original ?? fallback;
  return { ...base, alt };
}

export interface DraftRequest {
  readonly kind: EntityKind;
  readonly values: FormValues;
  readonly original: AnyEntity | null;
  readonly site: ContentBundle['site'];
  readonly id: string;
  readonly order: number;
  readonly now: number;
  /**
   * Image references approved for this draft (a chosen file already published and
   * verified), keyed by the image field name (`cover`, `illustration`,
   * `heroImage`). Only a verified reference is ever passed in.
   */
  readonly media?: Readonly<Record<string, ImageRef>>;
}

export type DraftAssembly =
  | { readonly ok: true; readonly entity: AnyEntity }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Builds the entity a form would publish, then validates it with the read-path validator. */
export function assembleDraft(request: DraftRequest): DraftAssembly {
  const errors = new FieldErrors();
  const values = request.values;
  const original = request.original;
  const title = errors.require(values.title ?? '', 'Title', 120);

  const envelope = {
    schema: SCHEMA_VERSION,
    id: request.id,
    kind: request.kind,
    rev: original === null ? 1 : original.rev + 1,
    state: 'active' as const,
    createdAt: original === null ? request.now : original.createdAt,
    updatedAt: request.now,
    deletedAt: null,
    order: original === null ? request.order : original.order,
    title,
  };

  let candidate: unknown;

  switch (request.kind) {
    case 'highlight': {
      const variant = values.variant === 'overlay' ? 'overlay' : 'plain';
      const payload: HighlightPayload = {
        body: errors.require(values.body ?? '', 'Question line', 120),
        bullets: splitLines(values.bullets ?? ''),
        variant,
        cta: requiredLink(errors, values, 'cta', 'Button'),
      };
      candidate = { ...envelope, payload };
      break;
    }
    case 'service': {
      const payload: ServicePayload = {
        summary: errors.require(values.summary ?? '', 'Summary', 200),
        icon: errors.require(values.icon ?? '', 'Icon', 8),
        bullets: splitLines(values.bullets ?? ''),
        ...((): { link?: LinkRef } => {
          const link = optionalLink(errors, values, 'link', 'Link');
          return link === undefined ? {} : { link };
        })(),
      };
      candidate = { ...envelope, payload };
      break;
    }
    case 'step': {
      const originalPayload = original?.kind === 'step' ? original.payload : null;
      const payload: StepPayload = {
        description: errors.require(values.description ?? '', 'Description', 400),
        illustration: altEnabledImage(
          request.media?.illustration ?? originalPayload?.illustration,
          {
            source: 'placeholder',
            label: title === '' ? 'New step' : title,
            alt: 'Illustration',
          },
          errors.require(values['illustration.alt'] ?? '', 'Image alt text', 160),
        ),
        ...((): { link?: LinkRef } => {
          const link = optionalLink(errors, values, 'link', 'Link');
          return link === undefined ? {} : { link };
        })(),
      };
      candidate = { ...envelope, payload };
      break;
    }
    case 'work': {
      const originalPayload = original?.kind === 'work' ? original.payload : null;
      const links = pairsToLinks(splitLinkPairs(values.links ?? ''));
      if (links.length === 0) errors.list.push('Project links: at least one link is required');
      links.forEach((link, index) => {
        if (link.label === '' || link.href === '') {
          errors.list.push(`Project links: line ${String(index + 1)} needs "label | target"`);
        }
      });
      const payload: WorkPayload = {
        buildKind: errors.require(values.buildKind ?? '', 'Build kind', 60),
        summary: errors.optional(values.summary ?? '', 'Summary', 400),
        links,
        featured: values.featured === 'true',
        cover: altEnabledImage(
          request.media?.cover ?? originalPayload?.cover,
          {
            source: 'placeholder',
            label: title === '' ? 'New project' : title,
            alt: 'Cover image',
          },
          errors.require(values['cover.alt'] ?? '', 'Cover alt text', 160),
        ),
      };
      candidate = { ...envelope, payload };
      break;
    }
    case 'price': {
      const payload: PricePayload = {
        lines: pairsToPriceLines(splitIconPairs(values.lines ?? '')),
        note: errors.optional(values.note ?? '', 'Note', 200),
        cta: requiredLink(errors, values, 'cta', 'Order button'),
      };
      candidate = { ...envelope, payload };
      break;
    }
    case 'article': {
      const originalPayload = original?.kind === 'article' ? original.payload : null;
      const articlePayload: ArticlePayload = {
        slug: errors.require(values.slug ?? '', 'Route slug', 60),
        summary: errors.require(values.summary ?? '', 'Summary', 400),
        heroImage: altEnabledImage(
          request.media?.heroImage ?? originalPayload?.heroImage,
          {
            source: 'placeholder',
            label: title === '' ? 'New article' : title,
            alt: 'Cover image',
          },
          errors.require(values['heroImage.alt'] ?? '', 'Hero alt text', 160),
        ),
        blocks: parseBlocks(values.blocks ?? '', errors),
        tags: splitLines(values.tags ?? ''),
      };
      candidate = { ...envelope, payload: articlePayload };
      break;
    }
    case 'site': {
      const payload: SitePayload = {
        ...request.site.payload,
        brand: {
          ...request.site.payload.brand,
          name:
            errors.optional(values['brand.name'] ?? '', 'Navbar wordmark', 120) ||
            request.site.payload.brand.name,
          tagline: errors.optional(values['brand.tagline'] ?? '', 'Tagline', 200),
        },
        hero: {
          heading: errors.require(values['hero.heading'] ?? '', 'Headline', 120),
          subtitle: errors.require(values['hero.subtitle'] ?? '', 'Subtitle', 400),
        },
        contact: {
          ...request.site.payload.contact,
          heading:
            errors.optional(values['contact.heading'] ?? '', 'Contact heading', 120) ||
            request.site.payload.contact.heading,
        },
        footer: {
          credit: parseInlineSegments(values['footer.credit'] ?? ''),
          creditNote: errors.optional(values['footer.creditNote'] ?? '', 'Credit note', 200),
        },
      };
      candidate = { ...envelope, payload };
      break;
    }
  }

  if (errors.list.length > 0) return { ok: false, errors: errors.list };

  const validation = validateEntity(candidate);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  return { ok: true, entity: validation.value };
}

/** Sparse ordering for a new entity: one gap large enough for a few inserts. */
export function nextOrder(entities: readonly AnyEntity[]): number {
  if (entities.length === 0) return 10;
  return Math.max(...entities.map((entity) => entity.order)) + 10;
}
