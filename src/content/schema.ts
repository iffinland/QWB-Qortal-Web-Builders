/**
 * QWB content schema (beta).
 *
 * Every editable thing is one QDN JSON resource carrying the approved envelope:
 * `schema`, its own `id` (= the QDN identifier), `kind`, a monotonically
 * increasing `rev` (the write-verification handle), a lifecycle `state`
 * (`active` | `deleted`), a `hidden` flag (owner hides without deleting), a
 * sparse `order`, and a kind-specific `payload`.
 *
 * Nothing in this module touches the network or the DOM. Validation returns
 * explicit error paths so that an invalid entity is never rendered silently.
 */

export const SCHEMA_VERSION = 1;

export type EntityKind = 'site' | 'service' | 'step' | 'work' | 'price' | 'article';

export type EntityState = 'active' | 'deleted';

/** QDN identifier prefix per entity kind. */
const KIND_PREFIX: Readonly<Record<EntityKind, string>> = {
  site: 'qwb_site_',
  service: 'qwb_svc_',
  step: 'qwb_step_',
  work: 'qwb_work_',
  price: 'qwb_price_',
  article: 'qwb_post_',
};

export function identifierPrefixFor(kind: EntityKind): string {
  return KIND_PREFIX[kind];
}

/** Identifier policy: lowercase `[a-z0-9_-]`, at most 60 characters. */
export const MAX_IDENTIFIER_LENGTH = 60;

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidIdentifier(id: string): boolean {
  return id.length <= MAX_IDENTIFIER_LENGTH && IDENTIFIER_PATTERN.test(id);
}

export function isEntityKind(value: unknown): value is EntityKind {
  return typeof value === 'string' && Object.hasOwn(KIND_PREFIX, value);
}

/** Public URL slugs (project and article routes): lowercase words joined by hyphens. */
export const MAX_SLUG_LENGTH = 80;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

/**
 * Links may only point inside the app (`#…`) or to a Qortal deep link. Plain
 * `https://` links are dead inside a Qortal host (Core's q-apps.js blocks them),
 * so the schema refuses them rather than rendering broken anchors.
 */
export function isAllowedHref(href: string): boolean {
  return href.startsWith('#') || href.startsWith('qortal://');
}

/** A reference to an image, resolved to a URL only at render time. */
export type ImageRef =
  | {
      /** Shipped inside the app archive (brand or structural asset). */
      readonly source: 'bundled';
      readonly src: string;
      readonly alt: string;
    }
  | {
      /** QDN-managed media; resolved to an absolute /arbitrary/... URL. */
      readonly source: 'qdn';
      readonly service: 'THUMBNAIL' | 'IMAGE';
      readonly name: string;
      readonly identifier: string;
      readonly filename: string;
      readonly alt: string;
    }
  | {
      /** Placeholder cover used until the owner publishes real media. */
      readonly source: 'placeholder';
      readonly label: string;
      readonly alt: string;
    };

/** A QDN-hosted video (service VIDEO). Optional on a project. */
export interface VideoRef {
  readonly name: string;
  readonly identifier: string;
  readonly filename: string;
  readonly title: string;
}

/** A link target: an in-app hash route or a Qortal deep link. */
export interface LinkRef {
  readonly label: string;
  readonly href: string;
}

/** Text with optional inline links; rendered by escaping, never by innerHTML. */
export interface InlineSegment {
  readonly text: string;
  readonly href?: string;
}

export type Inline = readonly InlineSegment[];

export interface NavItem {
  readonly label: string;
  readonly href: string;
}

/**
 * The one-page layout. Exactly these six sections, in this order. Their ids are
 * the DOM anchors (`#services`, `#portfolio`, …) and the legacy `#section_N`
 * links are mapped onto them by the router.
 */
export const SECTION_IDS = [
  'hero',
  'services',
  'portfolio',
  'how-it-works',
  'pricing',
  'contact',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export interface SiteSection {
  readonly id: SectionId;
  readonly label: string;
  readonly visible: boolean;
}

export interface ContactRow {
  readonly label: string;
  readonly value: string;
  readonly href: string;
}

export interface ContactColumn {
  readonly title: string;
  readonly rows: readonly ContactRow[];
}

export interface SitePayload {
  readonly brand: {
    readonly name: string;
    readonly tagline: string;
    readonly since: string;
  };
  readonly logo: ImageRef;
  readonly mark: ImageRef;
  readonly nav: readonly NavItem[];
  readonly hero: {
    readonly heading: string;
    readonly subtitle: string;
    readonly primaryCta: LinkRef;
    readonly secondaryCta: LinkRef;
  };
  readonly sections: readonly SiteSection[];
  readonly contact: {
    readonly heading: string;
    readonly intro: string;
    readonly columns: readonly ContactColumn[];
  };
  readonly footer: {
    readonly credit: Inline;
    readonly creditNote: string;
  };
  readonly meta: {
    readonly title: string;
    readonly description: string;
  };
}

export interface ServicePayload {
  readonly summary: string;
  readonly bullets: readonly string[];
  readonly icon: string;
  readonly cta?: LinkRef;
}

export interface StepPayload {
  readonly description: string;
  readonly illustration: ImageRef;
}

export interface WorkPayload {
  /** Public route segment: `#/work/<slug>`. Permanent once published. */
  readonly slug: string;
  readonly summary: string;
  /** Long-form description, one entry per paragraph. */
  readonly description: readonly string[];
  readonly categories: readonly string[];
  /** At least one image; the first is the card cover. */
  readonly images: readonly ImageRef[];
  readonly video?: VideoRef;
  /** Direct Qortal links to the live project (at least one). */
  readonly links: readonly LinkRef[];
  readonly featured: boolean;
}

export interface PriceLine {
  readonly icon: string;
  readonly text: string;
}

export interface PricePayload {
  readonly intro: string;
  readonly lines: readonly PriceLine[];
  readonly cta: LinkRef;
  readonly note: string;
}

export type ArticleBlock =
  | { readonly type: 'paragraph'; readonly text: string }
  | { readonly type: 'heading'; readonly text: string }
  | { readonly type: 'bullets'; readonly items: readonly Inline[] }
  | { readonly type: 'note'; readonly text: string; readonly action?: LinkRef };

export interface ArticlePayload {
  readonly slug: string;
  readonly summary: string;
  readonly heroImage: ImageRef;
  readonly blocks: readonly ArticleBlock[];
  readonly tags: readonly string[];
}

export interface EntityEnvelope<K extends EntityKind, P> {
  /** Payload format version. Unknown versions are rejected, never rendered. */
  readonly schema: number;
  /** The QDN identifier, duplicated inside the payload. Permanent identity. */
  readonly id: string;
  readonly kind: K;
  /** Monotonically increasing per entity; the write-verification handle. */
  readonly rev: number;
  readonly state: EntityState;
  /** Owner-controlled visibility. A hidden entity is kept but not shown publicly. */
  readonly hidden: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly deletedAt: number | null;
  /** Sparse ordering (10, 20, 30 …): a reorder republishes the affected entities. */
  readonly order: number;
  readonly title: string;
  readonly payload: P;
}

export type SiteEntity = EntityEnvelope<'site', SitePayload>;
export type ServiceEntity = EntityEnvelope<'service', ServicePayload>;
export type StepEntity = EntityEnvelope<'step', StepPayload>;
export type WorkEntity = EntityEnvelope<'work', WorkPayload>;
export type PriceEntity = EntityEnvelope<'price', PricePayload>;
export type ArticleEntity = EntityEnvelope<'article', ArticlePayload>;

export type AnyEntity =
  SiteEntity | ServiceEntity | StepEntity | WorkEntity | PriceEntity | ArticleEntity;

/** The collections of a site. `site` is a singleton; every other key is a list. */
export interface ContentBundle {
  readonly site: SiteEntity;
  readonly services: readonly ServiceEntity[];
  readonly steps: readonly StepEntity[];
  readonly works: readonly WorkEntity[];
  readonly prices: readonly PriceEntity[];
  readonly articles: readonly ArticleEntity[];
}

export const COLLECTION_KINDS = {
  services: 'service',
  steps: 'step',
  works: 'work',
  prices: 'price',
  articles: 'article',
} as const;

export type CollectionKey = keyof typeof COLLECTION_KINDS;

/* ------------------------------------------------------------------------ */
/* Validation                                                                */
/* ------------------------------------------------------------------------ */

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function checkLink(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected a link object`);
    return;
  }
  if (!isNonEmptyString(value.label)) errors.push(`${path}.label: expected a non-empty string`);
  if (!isNonEmptyString(value.href) || !isAllowedHref(value.href)) {
    errors.push(`${path}.href: expected an in-app hash or a qortal:// link`);
  }
}

function checkImage(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an image reference`);
    return;
  }
  if (!isNonEmptyString(value.alt)) errors.push(`${path}.alt: expected a non-empty string`);
  switch (value.source) {
    case 'bundled':
      if (!isNonEmptyString(value.src)) errors.push(`${path}.src: expected a non-empty string`);
      break;
    case 'qdn':
      if (value.service !== 'THUMBNAIL' && value.service !== 'IMAGE') {
        errors.push(`${path}.service: expected THUMBNAIL or IMAGE`);
      }
      if (!isNonEmptyString(value.name)) errors.push(`${path}.name: expected a publishing name`);
      if (!isNonEmptyString(value.identifier))
        errors.push(`${path}.identifier: expected an identifier`);
      if (!isNonEmptyString(value.filename)) errors.push(`${path}.filename: expected a filename`);
      break;
    case 'placeholder':
      if (!isNonEmptyString(value.label))
        errors.push(`${path}.label: expected a placeholder label`);
      break;
    default:
      errors.push(`${path}.source: expected bundled, qdn or placeholder`);
  }
}

function checkVideo(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected a video reference`);
    return;
  }
  if (!isNonEmptyString(value.name)) errors.push(`${path}.name: expected a publishing name`);
  if (!isNonEmptyString(value.identifier))
    errors.push(`${path}.identifier: expected an identifier`);
  if (!isNonEmptyString(value.filename)) errors.push(`${path}.filename: expected a filename`);
  if (!isNonEmptyString(value.title)) errors.push(`${path}.title: expected a non-empty string`);
}

function checkInline(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected an array of text segments`);
    return;
  }
  value.forEach((segment, index) => {
    if (!isRecord(segment) || !isNonEmptyString(segment.text)) {
      errors.push(`${path}[${index}]: expected a text segment`);
      return;
    }
    if (
      segment.href !== undefined &&
      (typeof segment.href !== 'string' || !isAllowedHref(segment.href))
    ) {
      errors.push(`${path}[${index}].href: expected an in-app hash or a qortal:// link`);
    }
  });
}

function checkArticleBlock(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an article block`);
    return;
  }
  switch (value.type) {
    case 'paragraph':
    case 'heading':
      if (!isNonEmptyString(value.text)) errors.push(`${path}.text: expected a non-empty string`);
      break;
    case 'bullets':
      if (!Array.isArray(value.items)) {
        errors.push(`${path}.items: expected an array of inline runs`);
        break;
      }
      value.items.forEach((item, index) => checkInline(item, `${path}.items[${index}]`, errors));
      break;
    case 'note':
      if (!isNonEmptyString(value.text)) errors.push(`${path}.text: expected a non-empty string`);
      if (value.action !== undefined) checkLink(value.action, `${path}.action`, errors);
      break;
    default:
      errors.push(`${path}.type: expected paragraph, heading, bullets or note`);
  }
}

function checkSite(payload: Record<string, unknown>, path: string, errors: string[]): void {
  if (!isRecord(payload.brand)) errors.push(`${path}.brand: expected an object`);
  checkImage(payload.logo, `${path}.logo`, errors);
  checkImage(payload.mark, `${path}.mark`, errors);
  if (!Array.isArray(payload.nav)) {
    errors.push(`${path}.nav: expected an array`);
  } else {
    payload.nav.forEach((item, index) => checkLink(item, `${path}.nav[${index}]`, errors));
  }
  if (!isRecord(payload.hero)) {
    errors.push(`${path}.hero: expected an object`);
  } else {
    checkLink(payload.hero.primaryCta, `${path}.hero.primaryCta`, errors);
    checkLink(payload.hero.secondaryCta, `${path}.hero.secondaryCta`, errors);
  }
  if (!isRecord(payload.meta)) errors.push(`${path}.meta: expected an object`);

  // Exactly the six approved sections, in order: no extras, no duplicates, none missing.
  if (!Array.isArray(payload.sections)) {
    errors.push(`${path}.sections: expected an array`);
  } else {
    const ids = payload.sections.map((section) => (isRecord(section) ? section.id : undefined));
    const expected = [...SECTION_IDS] as string[];
    if (ids.length !== expected.length || ids.some((id, index) => id !== expected[index])) {
      errors.push(`${path}.sections: expected exactly ${expected.join(', ')} in this order`);
    }
    payload.sections.forEach((section, index) => {
      const sectionPath = `${path}.sections[${index}]`;
      if (!isRecord(section)) {
        errors.push(`${sectionPath}: expected an object`);
        return;
      }
      if (!isNonEmptyString(section.label)) {
        errors.push(`${sectionPath}.label: expected a non-empty string`);
      }
      if (typeof section.visible !== 'boolean') {
        errors.push(`${sectionPath}.visible: expected a boolean`);
      }
    });
  }

  if (!isRecord(payload.contact)) {
    errors.push(`${path}.contact: expected an object`);
  } else if (!Array.isArray(payload.contact.columns)) {
    errors.push(`${path}.contact.columns: expected an array`);
  }
  if (!isRecord(payload.footer)) errors.push(`${path}.footer: expected an object`);
}

function checkPayload(kind: EntityKind, payload: unknown, path: string, errors: string[]): void {
  if (!isRecord(payload)) {
    errors.push(`${path}: expected a payload object`);
    return;
  }
  switch (kind) {
    case 'site':
      checkSite(payload, path, errors);
      break;
    case 'service':
      if (!isNonEmptyString(payload.summary))
        errors.push(`${path}.summary: expected a non-empty string`);
      if (!isStringArray(payload.bullets)) errors.push(`${path}.bullets: expected a string array`);
      if (!isNonEmptyString(payload.icon)) errors.push(`${path}.icon: expected a non-empty string`);
      if (payload.cta !== undefined) checkLink(payload.cta, `${path}.cta`, errors);
      break;
    case 'step':
      if (!isNonEmptyString(payload.description)) {
        errors.push(`${path}.description: expected a non-empty string`);
      }
      checkImage(payload.illustration, `${path}.illustration`, errors);
      break;
    case 'work':
      if (!isNonEmptyString(payload.slug) || !isValidSlug(payload.slug)) {
        errors.push(`${path}.slug: expected lowercase words joined by hyphens`);
      }
      if (!isNonEmptyString(payload.summary))
        errors.push(`${path}.summary: expected a non-empty string`);
      if (!isStringArray(payload.description) || payload.description.length === 0) {
        errors.push(`${path}.description: expected at least one paragraph`);
      }
      if (!isStringArray(payload.categories) || payload.categories.length === 0) {
        errors.push(`${path}.categories: expected at least one category`);
      }
      if (typeof payload.featured !== 'boolean')
        errors.push(`${path}.featured: expected a boolean`);
      if (!Array.isArray(payload.images) || payload.images.length === 0) {
        errors.push(`${path}.images: expected at least one image`);
      } else {
        payload.images.forEach((image, index) =>
          checkImage(image, `${path}.images[${index}]`, errors),
        );
      }
      if (payload.video !== undefined) checkVideo(payload.video, `${path}.video`, errors);
      if (!Array.isArray(payload.links) || payload.links.length === 0) {
        errors.push(`${path}.links: expected at least one link`);
      } else {
        payload.links.forEach((link, index) => checkLink(link, `${path}.links[${index}]`, errors));
      }
      break;
    case 'price':
      if (!isNonEmptyString(payload.intro))
        errors.push(`${path}.intro: expected a non-empty string`);
      if (!Array.isArray(payload.lines)) {
        errors.push(`${path}.lines: expected an array`);
      } else {
        payload.lines.forEach((line, index) => {
          if (!isRecord(line) || !isNonEmptyString(line.text)) {
            errors.push(`${path}.lines[${index}]: expected an icon/text line`);
          }
        });
      }
      checkLink(payload.cta, `${path}.cta`, errors);
      if (!isNonEmptyString(payload.note)) errors.push(`${path}.note: expected a non-empty string`);
      break;
    case 'article':
      if (!isNonEmptyString(payload.slug) || !isValidSlug(payload.slug)) {
        errors.push(`${path}.slug: expected lowercase words joined by hyphens`);
      }
      if (!isNonEmptyString(payload.summary))
        errors.push(`${path}.summary: expected a non-empty string`);
      checkImage(payload.heroImage, `${path}.heroImage`, errors);
      if (!Array.isArray(payload.blocks)) {
        errors.push(`${path}.blocks: expected an array`);
      } else {
        payload.blocks.forEach((block, index) =>
          checkArticleBlock(block, `${path}.blocks[${index}]`, errors),
        );
      }
      if (!isStringArray(payload.tags)) errors.push(`${path}.tags: expected a string array`);
      break;
  }
}

/**
 * Validates one entity envelope plus its kind-specific payload.
 * Unknown `schema` versions are rejected rather than rendered.
 */
export function validateEntity(value: unknown, path = 'entity'): ValidationResult<AnyEntity> {
  const errors: string[] = [];

  if (!isRecord(value)) return { ok: false, errors: [`${path}: expected an object`] };

  if (value.schema !== SCHEMA_VERSION) {
    errors.push(`${path}.schema: expected ${SCHEMA_VERSION}, received ${String(value.schema)}`);
  }
  if (!isEntityKind(value.kind)) {
    errors.push(`${path}.kind: unknown entity kind ${String(value.kind)}`);
    return { ok: false, errors };
  }
  if (!isNonEmptyString(value.id)) {
    errors.push(`${path}.id: expected a non-empty identifier`);
  } else if (!value.id.startsWith(identifierPrefixFor(value.kind))) {
    errors.push(
      `${path}.id: expected the ${identifierPrefixFor(value.kind)} prefix, received ${value.id}`,
    );
  } else if (!isValidIdentifier(value.id)) {
    errors.push(
      `${path}.id: expected lowercase [a-z0-9_-] and at most ${MAX_IDENTIFIER_LENGTH} characters, received ${value.id}`,
    );
  }
  if (!isNonEmptyString(value.title)) errors.push(`${path}.title: expected a non-empty string`);
  if (!isFiniteNumber(value.rev) || value.rev < 1)
    errors.push(`${path}.rev: expected a number >= 1`);
  if (value.state !== 'active' && value.state !== 'deleted') {
    errors.push(`${path}.state: expected active or deleted`);
  }
  if (typeof value.hidden !== 'boolean') errors.push(`${path}.hidden: expected a boolean`);
  if (!isFiniteNumber(value.order)) errors.push(`${path}.order: expected a number`);
  if (!isFiniteNumber(value.createdAt)) errors.push(`${path}.createdAt: expected a number`);
  if (!isFiniteNumber(value.updatedAt)) errors.push(`${path}.updatedAt: expected a number`);
  if (value.deletedAt !== null && !isFiniteNumber(value.deletedAt)) {
    errors.push(`${path}.deletedAt: expected null or a number`);
  }

  checkPayload(value.kind, value.payload, `${path}.payload`, errors);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: value as unknown as AnyEntity };
}

/**
 * Validates the whole content bundle: one `site` singleton, entity lists, and
 * cross-entity rules (unique identifiers, unique project and article slugs).
 */
export function validateBundle(bundle: unknown): ValidationResult<ContentBundle> {
  const errors: string[] = [];
  if (!isRecord(bundle)) return { ok: false, errors: ['bundle: expected an object'] };

  const site = validateEntity(bundle.site, 'site');
  if (!site.ok) errors.push(...site.errors);
  else if (site.value.kind !== 'site') errors.push('site: expected the site singleton');

  const collect = <K extends EntityKind>(
    key: string,
    expected: K,
  ): readonly Extract<AnyEntity, { kind: K }>[] => {
    const list = bundle[key];
    if (!Array.isArray(list)) {
      errors.push(`${key}: expected an array`);
      return [];
    }
    const accepted: Extract<AnyEntity, { kind: K }>[] = [];
    list.forEach((entry, index) => {
      const result = validateEntity(entry, `${key}[${index}]`);
      if (!result.ok) {
        errors.push(...result.errors);
        return;
      }
      if (result.value.kind !== expected) {
        errors.push(`${key}[${index}]: expected kind ${expected}`);
        return;
      }
      accepted.push(result.value as Extract<AnyEntity, { kind: K }>);
    });
    return accepted;
  };

  const services = collect('services', 'service');
  const steps = collect('steps', 'step');
  const works = collect('works', 'work');
  const prices = collect('prices', 'price');
  const articles = collect('articles', 'article');

  errors.push(...findDuplicates(works, 'work', (entity) => entity.payload.slug, 'slug'));
  errors.push(...findDuplicates(articles, 'article', (entity) => entity.payload.slug, 'slug'));
  errors.push(
    ...findDuplicates(
      [site.ok ? site.value : null, ...services, ...steps, ...works, ...prices, ...articles].filter(
        (entity): entity is AnyEntity => entity !== null,
      ),
      'entity',
      (entity) => entity.id,
      'identifier',
    ),
  );

  if (errors.length > 0 || !site.ok) return { ok: false, errors };

  return {
    ok: true,
    value: {
      site: site.value as SiteEntity,
      services,
      steps,
      works,
      prices,
      articles,
    },
  };
}

function findDuplicates<E extends AnyEntity>(
  entities: readonly E[],
  label: string,
  keyOf: (entity: E) => string,
  keyName: string,
): string[] {
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const entity of entities) {
    const key = keyOf(entity);
    if (seen.has(key)) errors.push(`${label}: duplicate ${keyName} ${key}`);
    seen.add(key);
  }
  return errors;
}
