/**
 * Form model for the owner console.
 *
 * Every editable entity kind is described by a list of fields. Values are plain
 * strings (or booleans for checkboxes) so the browser form can round-trip them.
 * `toValues` reads an entity into fields, `fromValues` rebuilds a candidate
 * entity from the fields and reports every problem in plain words. Fields that
 * the form does not show are kept from the base entity, so editing never drops
 * data the owner cannot see.
 *
 * Text conventions used in the textareas:
 *  - one item per line for lists (bullets, paragraphs, image refs, links);
 *  - `label | href` for links and CTAs (href must be `#…` or `qortal://…`);
 *  - image refs: `qdn | name | identifier | filename | alt`,
 *    `placeholder | label | alt`, or `bundled | src | alt`;
 *  - article body: `## heading`, `- bullet`, `> note`, anything else is a paragraph.
 */

import type {
  AnyEntity,
  ArticleBlock,
  ArticleEntity,
  ContactColumn,
  EntityKind,
  ImageRef,
  Inline,
  LinkRef,
  PriceLine,
  SiteEntity,
  VideoRef,
  WorkEntity,
} from '../content/schema';
import { isAllowedHref, isValidSlug } from '../content/schema';

export type FieldType = 'text' | 'textarea' | 'checkbox';

export interface FieldSpec {
  readonly name: string;
  readonly label: string;
  readonly type: FieldType;
  readonly help?: string;
  readonly rows?: number;
}

export type FormValues = Readonly<Record<string, string | boolean>>;

export type FormResult =
  | { readonly ok: true; readonly entity: AnyEntity }
  | { readonly ok: false; readonly errors: readonly string[] };

const TITLE: FieldSpec = { name: 'title', label: 'Title', type: 'text' };
const SLUG: FieldSpec = {
  name: 'slug',
  label: 'Address (slug)',
  type: 'text',
  help: 'Lowercase letters, digits and dashes. Fixed once published.',
};
const SUMMARY: FieldSpec = { name: 'summary', label: 'Short summary', type: 'textarea', rows: 2 };
const IMAGES_HELP =
  'One per line: qdn | name | identifier | filename | alt, or placeholder | label | alt';

export const FORM_FIELDS: Readonly<Record<EntityKind, readonly FieldSpec[]>> = {
  site: [
    { name: 'title', label: 'Brand name', type: 'text' },
    { name: 'tagline', label: 'Tagline', type: 'text' },
    { name: 'heroHeading', label: 'Hero heading', type: 'text' },
    { name: 'heroSubtitle', label: 'Hero subtitle', type: 'textarea', rows: 3 },
    {
      name: 'heroPrimary',
      label: 'Hero button 1',
      type: 'text',
      help: 'label | href  (e.g. Request a quote | #contact)',
    },
    { name: 'heroSecondary', label: 'Hero button 2', type: 'text', help: 'label | href' },
    { name: 'contactHeading', label: 'Contact heading', type: 'text' },
    { name: 'contactIntro', label: 'Contact intro', type: 'textarea', rows: 3 },
    {
      name: 'contactRows',
      label: 'Contact details',
      type: 'textarea',
      rows: 6,
      help: 'One row per line: Column | Label | Value | href  (href: qortal://… or #…)',
    },
    { name: 'creditNote', label: 'Footer note', type: 'text' },
    { name: 'metaTitle', label: 'Browser title', type: 'text' },
    { name: 'metaDescription', label: 'Search description', type: 'textarea', rows: 2 },
  ],
  service: [
    TITLE,
    { name: 'icon', label: 'Icon (emoji)', type: 'text' },
    SUMMARY,
    { name: 'bullets', label: 'Bullet points', type: 'textarea', rows: 4, help: 'One per line' },
    { name: 'cta', label: 'Button (optional)', type: 'text', help: 'label | href' },
  ],
  step: [
    TITLE,
    { name: 'description', label: 'Description', type: 'textarea', rows: 3 },
    { name: 'illustration', label: 'Illustration', type: 'text', help: IMAGES_HELP },
  ],
  work: [
    TITLE,
    SLUG,
    { name: 'featured', label: 'Feature on the homepage', type: 'checkbox' },
    SUMMARY,
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      rows: 6,
      help: 'One paragraph per line',
    },
    { name: 'categories', label: 'Categories', type: 'text', help: 'Comma separated' },
    { name: 'images', label: 'Images', type: 'textarea', rows: 4, help: IMAGES_HELP },
    {
      name: 'video',
      label: 'Video (optional)',
      type: 'text',
      help: 'qdn | name | identifier | filename | title',
    },
    {
      name: 'links',
      label: 'Qortal links',
      type: 'textarea',
      rows: 3,
      help: 'One per line: label | qortal://…',
    },
  ],
  price: [
    TITLE,
    { name: 'intro', label: 'Intro', type: 'textarea', rows: 3 },
    {
      name: 'lines',
      label: 'Price points',
      type: 'textarea',
      rows: 4,
      help: 'One per line: icon | text',
    },
    { name: 'cta', label: 'Button', type: 'text', help: 'label | href' },
    { name: 'note', label: 'Note', type: 'textarea', rows: 2 },
  ],
  article: [
    TITLE,
    SLUG,
    SUMMARY,
    { name: 'heroImage', label: 'Cover image', type: 'text', help: IMAGES_HELP },
    {
      name: 'body',
      label: 'Article text',
      type: 'textarea',
      rows: 12,
      help: '## heading, - bullet, > note, other lines are paragraphs',
    },
    { name: 'tags', label: 'Tags', type: 'text', help: 'Comma separated' },
  ],
};

/* ------------------------------------------------------------------------ */
/* Parsing helpers                                                           */
/* ------------------------------------------------------------------------ */

function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function parts(line: string): string[] {
  return line.split('|').map((part) => part.trim());
}

function parseLink(text: string, label: string, errors: string[]): LinkRef | null {
  const value = text.trim();
  if (value === '') return null;
  const [linkLabel = '', href = ''] = parts(value);
  if (linkLabel === '' || href === '') {
    errors.push(`${label}: use the form "label | href".`);
    return null;
  }
  if (!isAllowedHref(href)) {
    errors.push(`${label}: the address must start with # or qortal://.`);
    return null;
  }
  return { label: linkLabel, href };
}

function parseLinkLines(text: string, label: string, errors: string[]): LinkRef[] {
  const result: LinkRef[] = [];
  for (const line of linesOf(text)) {
    const link = parseLink(line, label, errors);
    if (link !== null) result.push(link);
  }
  return result;
}

function parseImage(line: string, label: string, errors: string[]): ImageRef | null {
  const [kind = '', ...rest] = parts(line);
  if (kind === 'qdn') {
    const [name = '', identifier = '', filename = '', alt = ''] = rest;
    if (name === '' || identifier === '' || filename === '') {
      errors.push(`${label}: qdn images need name, identifier and filename.`);
      return null;
    }
    return { source: 'qdn', service: 'IMAGE', name, identifier, filename, alt };
  }
  if (kind === 'placeholder') {
    const [text = '', alt = ''] = rest;
    return { source: 'placeholder', label: text || 'Image', alt };
  }
  if (kind === 'bundled') {
    const [src = '', alt = ''] = rest;
    if (src === '') {
      errors.push(`${label}: bundled images need a src.`);
      return null;
    }
    return { source: 'bundled', src, alt };
  }
  errors.push(`${label}: unknown image type "${kind}". Use qdn, placeholder or bundled.`);
  return null;
}

function imageToLine(image: ImageRef): string {
  switch (image.source) {
    case 'qdn':
      return `qdn | ${image.name} | ${image.identifier} | ${image.filename} | ${image.alt}`;
    case 'placeholder':
      return `placeholder | ${image.label} | ${image.alt}`;
    case 'bundled':
      return `bundled | ${image.src} | ${image.alt}`;
  }
}

/**
 * A line that is unchanged from its base image keeps the base object. Text cannot
 * always carry a value that contains the `|` separator, so this keeps untouched
 * images exact.
 */
function parseImageLine(
  line: string,
  label: string,
  errors: string[],
  base: ImageRef | undefined,
): ImageRef | null {
  if (base !== undefined && imageToLine(base) === line) return base;
  return parseImage(line, label, errors);
}

function parseImages(
  text: string,
  label: string,
  errors: string[],
  base: readonly ImageRef[] = [],
): ImageRef[] {
  const result: ImageRef[] = [];
  linesOf(text).forEach((line, index) => {
    const image = parseImageLine(line, label, errors, base[index]);
    if (image !== null) result.push(image);
  });
  return result;
}

function parseImageOne(
  text: string,
  label: string,
  errors: string[],
  base: ImageRef | undefined,
): ImageRef | null {
  const list = linesOf(text);
  if (list.length === 0) {
    errors.push(`${label}: required.`);
    return null;
  }
  return parseImageLine(list[0] ?? '', label, errors, base);
}

function commaList(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function imageText(image: ImageRef | undefined): string {
  return image === undefined ? '' : imageToLine(image);
}

function linkLine(link: LinkRef | undefined): string {
  return link === undefined ? '' : `${link.label} | ${link.href}`;
}

/* ------------------------------------------------------------------------ */
/* Entity -> form values                                                     */
/* ------------------------------------------------------------------------ */

export function toValues(entity: AnyEntity): Record<string, string | boolean> {
  const base: Record<string, string | boolean> = { title: entity.title };
  switch (entity.kind) {
    case 'site': {
      const p = entity.payload;
      const rows = p.contact.columns.flatMap((column) =>
        column.rows.map((row) => `${column.title} | ${row.label} | ${row.value} | ${row.href}`),
      );
      return {
        ...base,
        title: p.brand.name,
        tagline: p.brand.tagline,
        heroHeading: p.hero.heading,
        heroSubtitle: p.hero.subtitle,
        heroPrimary: linkLine(p.hero.primaryCta),
        heroSecondary: linkLine(p.hero.secondaryCta),
        contactHeading: p.contact.heading,
        contactIntro: p.contact.intro,
        contactRows: rows.join('\n'),
        creditNote: p.footer.creditNote,
        metaTitle: p.meta.title,
        metaDescription: p.meta.description,
      };
    }
    case 'service':
      return {
        ...base,
        icon: entity.payload.icon,
        summary: entity.payload.summary,
        bullets: entity.payload.bullets.join('\n'),
        cta: linkLine(entity.payload.cta),
      };
    case 'step':
      return {
        ...base,
        description: entity.payload.description,
        illustration: imageText(entity.payload.illustration),
      };
    case 'work': {
      const p = entity.payload;
      return {
        ...base,
        slug: p.slug,
        featured: p.featured,
        summary: p.summary,
        description: p.description.join('\n'),
        categories: p.categories.join(', '),
        images: p.images.map(imageToLine).join('\n'),
        video: p.video
          ? `qdn | ${p.video.name} | ${p.video.identifier} | ${p.video.filename} | ${p.video.title}`
          : '',
        links: p.links.map((link) => `${link.label} | ${link.href}`).join('\n'),
      };
    }
    case 'price':
      return {
        ...base,
        intro: entity.payload.intro,
        lines: entity.payload.lines.map((line) => `${line.icon} | ${line.text}`).join('\n'),
        cta: linkLine(entity.payload.cta),
        note: entity.payload.note,
      };
    case 'article': {
      const p = entity.payload;
      return {
        ...base,
        slug: p.slug,
        summary: p.summary,
        heroImage: imageText(p.heroImage),
        body: p.blocks.map(blockToLine).join('\n'),
        tags: p.tags.join(', '),
      };
    }
  }
}

function inlineText(inline: Inline): string {
  return inline.map((segment) => segment.text).join('');
}

function blockToLine(block: ArticleBlock): string {
  switch (block.type) {
    case 'heading':
      return `## ${block.text}`;
    case 'paragraph':
      return block.text;
    case 'bullets':
      return block.items.map((item) => `- ${inlineText(item)}`).join('\n');
    case 'note':
      return `> ${block.text}`;
  }
}

function parseBody(text: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  for (const line of linesOf(text)) {
    if (line.startsWith('## ')) {
      blocks.push({ type: 'heading', text: line.slice(3).trim() });
    } else if (line.startsWith('- ')) {
      const item: Inline = [{ text: line.slice(2).trim() }];
      const last = blocks[blocks.length - 1];
      if (last !== undefined && last.type === 'bullets') {
        blocks[blocks.length - 1] = { type: 'bullets', items: [...last.items, item] };
      } else {
        blocks.push({ type: 'bullets', items: [item] });
      }
    } else if (line.startsWith('> ')) {
      blocks.push({ type: 'note', text: line.slice(2).trim() });
    } else {
      blocks.push({ type: 'paragraph', text: line });
    }
  }
  return blocks;
}

/* ------------------------------------------------------------------------ */
/* Form values -> candidate entity                                           */
/* ------------------------------------------------------------------------ */

function str(values: FormValues, name: string): string {
  const value = values[name];
  return typeof value === 'string' ? value.trim() : '';
}

function bool(values: FormValues, name: string): boolean {
  return values[name] === true || values[name] === 'on' || values[name] === 'true';
}

function parseColumns(text: string, errors: string[]): ContactColumn[] {
  const columns: { title: string; rows: { label: string; value: string; href: string }[] }[] = [];
  for (const line of linesOf(text)) {
    const [title = '', label = '', value = '', href = ''] = parts(line);
    if (title === '' || label === '' || value === '' || href === '') {
      errors.push('Contact details: each row needs Column | Label | Value | href.');
      continue;
    }
    if (!isAllowedHref(href)) {
      errors.push(`Contact details: "${label}" href must start with # or qortal://.`);
      continue;
    }
    let column = columns.find((item) => item.title === title);
    if (column === undefined) {
      column = { title, rows: [] };
      columns.push(column);
    }
    column.rows.push({ label, value, href });
  }
  return columns;
}

function parsePriceLines(text: string, errors: string[]): PriceLine[] {
  const result: PriceLine[] = [];
  for (const line of linesOf(text)) {
    const [icon = '', body = ''] = parts(line);
    if (body === '') {
      errors.push('Price points: each line needs icon | text.');
      continue;
    }
    result.push({ icon, text: body });
  }
  return result;
}

function parseVideo(text: string, errors: string[]): VideoRef | undefined {
  const value = text.trim();
  if (value === '') return undefined;
  const [kind = '', name = '', identifier = '', filename = '', title = ''] = parts(value);
  if (kind !== 'qdn' || name === '' || identifier === '' || filename === '') {
    errors.push('Video: use qdn | name | identifier | filename | title.');
    return undefined;
  }
  return { name, identifier, filename, title: title || filename };
}

/**
 * Builds a candidate entity from the form. `base` supplies every field the form
 * does not show (order, state, hidden flag, identifiers, untouched payload parts).
 */
export function fromValues(
  base: AnyEntity,
  values: FormValues,
  stamp: number,
  expectedRev: number | null,
): FormResult {
  const errors: string[] = [];
  const title = str(values, 'title');
  if (title === '') errors.push('Title is required.');

  let payload: unknown;
  switch (base.kind) {
    case 'site': {
      const p = base.payload;
      const primary = parseLink(str(values, 'heroPrimary'), 'Hero button 1', errors);
      const secondary = parseLink(str(values, 'heroSecondary'), 'Hero button 2', errors);
      if (primary === null) errors.push('Hero button 1 is required.');
      if (secondary === null) errors.push('Hero button 2 is required.');
      payload = {
        ...p,
        brand: { ...p.brand, name: title, tagline: str(values, 'tagline') },
        hero: {
          ...p.hero,
          heading: str(values, 'heroHeading'),
          subtitle: str(values, 'heroSubtitle'),
          primaryCta: primary ?? p.hero.primaryCta,
          secondaryCta: secondary ?? p.hero.secondaryCta,
        },
        contact: {
          ...p.contact,
          heading: str(values, 'contactHeading'),
          intro: str(values, 'contactIntro'),
          columns: parseColumns(str(values, 'contactRows'), errors),
        },
        footer: { ...p.footer, creditNote: str(values, 'creditNote') },
        meta: {
          title: str(values, 'metaTitle'),
          description: str(values, 'metaDescription'),
        },
      };
      break;
    }
    case 'service': {
      const cta = str(values, 'cta');
      payload = {
        summary: str(values, 'summary'),
        bullets: linesOf(str(values, 'bullets')),
        icon: str(values, 'icon'),
        ...(cta === '' ? {} : { cta: parseLink(cta, 'Button', errors) ?? undefined }),
      };
      break;
    }
    case 'step': {
      const illustration = parseImageOne(
        str(values, 'illustration'),
        'Illustration',
        errors,
        base.payload.illustration,
      );
      payload = {
        description: str(values, 'description'),
        illustration: illustration ?? base.payload.illustration,
      };
      break;
    }
    case 'work': {
      const slug = str(values, 'slug');
      if (!isValidSlug(slug))
        errors.push('Address (slug): use lowercase letters, digits and dashes.');
      const images = parseImages(str(values, 'images'), 'Images', errors, base.payload.images);
      if (images.length === 0) errors.push('Add at least one image.');
      const links = parseLinkLines(str(values, 'links'), 'Qortal links', errors);
      if (links.length === 0) errors.push('Add at least one Qortal link.');
      const video = parseVideo(str(values, 'video'), errors);
      payload = {
        slug,
        summary: str(values, 'summary'),
        description: linesOf(str(values, 'description')),
        categories: commaList(str(values, 'categories')),
        images,
        ...(video === undefined ? {} : { video }),
        links,
        featured: bool(values, 'featured'),
      };
      break;
    }
    case 'price': {
      const cta = parseLink(str(values, 'cta'), 'Button', errors);
      if (cta === null) errors.push('Button is required.');
      payload = {
        intro: str(values, 'intro'),
        lines: parsePriceLines(str(values, 'lines'), errors),
        cta: cta ?? base.payload.cta,
        note: str(values, 'note'),
      };
      break;
    }
    case 'article': {
      const slug = str(values, 'slug');
      if (!isValidSlug(slug))
        errors.push('Address (slug): use lowercase letters, digits and dashes.');
      const heroImage = parseImageOne(
        str(values, 'heroImage'),
        'Cover image',
        errors,
        base.payload.heroImage,
      );
      payload = {
        slug,
        summary: str(values, 'summary'),
        heroImage: heroImage ?? base.payload.heroImage,
        blocks: parseBody(str(values, 'body')),
        tags: commaList(str(values, 'tags')),
      };
      break;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const candidate = {
    ...base,
    rev: (expectedRev ?? 0) + 1,
    updatedAt: stamp,
    title,
    payload,
  } as AnyEntity;
  return { ok: true, entity: candidate };
}

export type { SiteEntity, ArticleEntity, WorkEntity };
