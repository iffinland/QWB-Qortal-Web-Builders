/**
 * QWB content schema.
 *
 * This is the approved entity envelope from the target architecture (§6.2):
 * every editable thing is one QDN resource carrying `schema`, its own `id`,
 * `kind`, a monotonically increasing `rev`, a lifecycle `state` and a sparse
 * `order` value, plus a kind-specific `payload`.
 *
 * Phase 1 renders `seed.ts` through this model. Phase 2/3 add owner editing and
 * QDN read/write through `repository.ts` without changing these types.
 */

export const SCHEMA_VERSION = 1;

export type EntityKind = 'site' | 'highlight' | 'service' | 'step' | 'work' | 'price' | 'article';

export type EntityState = 'active' | 'deleted';

/** QDN identifier prefix per entity kind (approved identifier policy). */
const KIND_PREFIX: Readonly<Record<EntityKind, string>> = {
  site: 'qwb_site_',
  highlight: 'qwb_hl_',
  service: 'qwb_svc_',
  step: 'qwb_step_',
  work: 'qwb_work_',
  price: 'qwb_price_',
  article: 'qwb_post_',
};

export function identifierPrefixFor(kind: EntityKind): string {
  return KIND_PREFIX[kind];
}

/**
 * QDN service each kind's payload is published in (audit §6.1, §5).
 *
 * `JSON` is the natural home for the small structured entities: the node validates
 * that the payload parses and caps it at 25 KB, which also bounds what a visitor's
 * page load has to fetch. Articles carry prose bodies and are the one kind the
 * approved model puts in `DOCUMENT` (no node-side size limit), which is also what
 * the reference app publishes its JSON records as.
 *
 * The service is a property of the *kind*, and the kind is encoded in the
 * identifier prefix, so a read-back can always address the coordinate a write
 * produced without carrying a second mapping around.
 */
const KIND_SERVICE: Readonly<Record<EntityKind, 'JSON' | 'DOCUMENT'>> = {
  site: 'JSON',
  highlight: 'JSON',
  service: 'JSON',
  step: 'JSON',
  work: 'JSON',
  price: 'JSON',
  article: 'DOCUMENT',
};

export type EntityService = 'JSON' | 'DOCUMENT';

export function serviceForKind(kind: EntityKind): EntityService {
  return KIND_SERVICE[kind];
}

/**
 * The service an already-published entity lives in, derived from its identifier.
 * An identifier that carries no known kind prefix is read as `JSON` (the
 * conservative default: it can only produce "not served", never a wrong match).
 */
export function serviceForIdentifier(identifier: string): EntityService {
  for (const kind of Object.keys(KIND_PREFIX) as EntityKind[]) {
    if (identifier.startsWith(KIND_PREFIX[kind])) return KIND_SERVICE[kind];
  }
  return 'JSON';
}

/** Approved identifier policy: lowercase `[a-z0-9_-]`, <= 60 characters. */
export const MAX_IDENTIFIER_LENGTH = 60;

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidIdentifier(id: string): boolean {
  return id.length <= MAX_IDENTIFIER_LENGTH && IDENTIFIER_PATTERN.test(id);
}

export function isEntityKind(value: unknown): value is EntityKind {
  return typeof value === 'string' && Object.hasOwn(KIND_PREFIX, value);
}

/** A reference to an image, resolved to a URL only at render time. */
export type ImageRef =
  | {
      /** Shipped inside the published app archive (brand/structural asset). */
      readonly source: 'bundled';
      readonly src: string;
      readonly alt: string;
    }
  | {
      /** QDN-managed content media; resolved to an absolute /arbitrary/... URL. */
      readonly source: 'qdn';
      readonly service: 'THUMBNAIL' | 'IMAGE';
      readonly name: string;
      readonly identifier: string;
      readonly filename: string;
      readonly alt: string;
    }
  | {
      /** Phase-1 seed placeholder; replaced by QDN media once the owner edits. */
      readonly source: 'placeholder';
      readonly label: string;
      readonly alt: string;
    };

/** A link target: either an in-app hash route (`#/works`) or a Qortal deep link. */
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

export interface ContactRow {
  readonly label: string;
  readonly value: string;
  readonly href: string;
}

export interface ContactColumn {
  readonly title: string;
  readonly rows: readonly ContactRow[];
}

export interface SiteSection {
  readonly id: string;
  readonly label: string;
  readonly visible: boolean;
  /**
   * Optional call to action shown inside the section. Owner-editable content
   * (the "What we build" pane's CTA lives here rather than in code).
   */
  readonly cta?: LinkRef;
}

export interface SitePayload {
  readonly brand: {
    readonly name: string;
    readonly markSrc: string;
    readonly since: string;
    readonly tagline: string;
  };
  readonly nav: readonly NavItem[];
  readonly hero: {
    readonly heading: string;
    readonly subtitle: string;
  };
  readonly sections: readonly SiteSection[];
  readonly tabs: readonly { readonly label: string }[];
  readonly contact: {
    readonly heading: string;
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

export interface HighlightPayload {
  readonly body: string;
  readonly bullets: readonly string[];
  readonly variant: 'plain' | 'overlay';
  readonly cta: LinkRef;
}

export interface ServicePayload {
  readonly summary: string;
  readonly bullets: readonly string[];
  readonly icon: string;
  readonly link?: LinkRef;
}

export interface StepPayload {
  readonly description: string;
  readonly illustration: ImageRef;
  readonly link?: LinkRef;
}

export interface WorkPayload {
  readonly buildKind: string;
  readonly summary: string;
  readonly links: readonly LinkRef[];
  readonly cover: ImageRef;
  readonly featured: boolean;
}

export interface PriceLine {
  readonly icon: string;
  readonly text: string;
}

export interface PricePayload {
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
  /** Payload format version. Unknown versions must never be rendered silently. */
  readonly schema: number;
  /** The QDN identifier, duplicated inside the payload. Permanent identity. */
  readonly id: string;
  readonly kind: K;
  /** Monotonically increasing per entity; the write-verification handle. */
  readonly rev: number;
  readonly state: EntityState;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly deletedAt: number | null;
  /** Sparse ordering (10, 20, 30 …): a reorder republishes one entity. */
  readonly order: number;
  readonly title: string;
  readonly payload: P;
}

export type SiteEntity = EntityEnvelope<'site', SitePayload>;
export type HighlightEntity = EntityEnvelope<'highlight', HighlightPayload>;
export type ServiceEntity = EntityEnvelope<'service', ServicePayload>;
export type StepEntity = EntityEnvelope<'step', StepPayload>;
export type WorkEntity = EntityEnvelope<'work', WorkPayload>;
export type PriceEntity = EntityEnvelope<'price', PricePayload>;
export type ArticleEntity = EntityEnvelope<'article', ArticlePayload>;

export type AnyEntity =
  | SiteEntity
  | HighlightEntity
  | ServiceEntity
  | StepEntity
  | WorkEntity
  | PriceEntity
  | ArticleEntity;

export interface ContentBundle {
  readonly site: SiteEntity;
  readonly highlights: readonly HighlightEntity[];
  readonly services: readonly ServiceEntity[];
  readonly steps: readonly StepEntity[];
  readonly works: readonly WorkEntity[];
  readonly prices: readonly PriceEntity[];
  readonly articles: readonly ArticleEntity[];
}

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
  if (!isNonEmptyString(value.href)) errors.push(`${path}.href: expected a non-empty string`);
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

function checkInline(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected an array of text segments`);
    return;
  }
  value.forEach((segment, index) => {
    if (!isRecord(segment) || !isNonEmptyString(segment.text)) {
      errors.push(`${path}[${index}]: expected a text segment`);
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

function checkPayload(kind: EntityKind, payload: unknown, path: string, errors: string[]): void {
  if (!isRecord(payload)) {
    errors.push(`${path}: expected a payload object`);
    return;
  }
  switch (kind) {
    case 'site':
      if (!isRecord(payload.brand)) errors.push(`${path}.brand: expected an object`);
      if (!isRecord(payload.hero)) errors.push(`${path}.hero: expected an object`);
      if (!isRecord(payload.meta)) errors.push(`${path}.meta: expected an object`);
      if (!Array.isArray(payload.nav)) errors.push(`${path}.nav: expected an array`);
      if (!Array.isArray(payload.sections)) {
        errors.push(`${path}.sections: expected an array`);
      } else {
        payload.sections.forEach((section, index) => {
          const sectionPath = `${path}.sections[${index}]`;
          if (!isRecord(section)) {
            errors.push(`${sectionPath}: expected an object`);
            return;
          }
          if (!isNonEmptyString(section.id))
            errors.push(`${sectionPath}.id: expected a non-empty string`);
          if (typeof section.visible !== 'boolean') {
            errors.push(`${sectionPath}.visible: expected a boolean`);
          }
          if (section.cta !== undefined) checkLink(section.cta, `${sectionPath}.cta`, errors);
        });
      }
      if (!Array.isArray(payload.tabs)) errors.push(`${path}.tabs: expected an array`);
      if (!isRecord(payload.contact)) errors.push(`${path}.contact: expected an object`);
      if (!isRecord(payload.footer)) errors.push(`${path}.footer: expected an object`);
      break;
    case 'highlight':
      if (!isNonEmptyString(payload.body)) errors.push(`${path}.body: expected a non-empty string`);
      if (!isStringArray(payload.bullets)) errors.push(`${path}.bullets: expected a string array`);
      if (payload.variant !== 'plain' && payload.variant !== 'overlay') {
        errors.push(`${path}.variant: expected plain or overlay`);
      }
      checkLink(payload.cta, `${path}.cta`, errors);
      break;
    case 'service':
      if (!isNonEmptyString(payload.summary))
        errors.push(`${path}.summary: expected a non-empty string`);
      if (!isStringArray(payload.bullets)) errors.push(`${path}.bullets: expected a string array`);
      if (payload.link !== undefined) checkLink(payload.link, `${path}.link`, errors);
      break;
    case 'step':
      if (!isNonEmptyString(payload.description)) {
        errors.push(`${path}.description: expected a non-empty string`);
      }
      checkImage(payload.illustration, `${path}.illustration`, errors);
      break;
    case 'work':
      if (!isNonEmptyString(payload.buildKind))
        errors.push(`${path}.buildKind: expected a non-empty string`);
      if (typeof payload.featured !== 'boolean')
        errors.push(`${path}.featured: expected a boolean`);
      checkImage(payload.cover, `${path}.cover`, errors);
      if (!Array.isArray(payload.links) || payload.links.length === 0) {
        errors.push(`${path}.links: expected at least one link`);
      } else {
        payload.links.forEach((link, index) => checkLink(link, `${path}.links[${index}]`, errors));
      }
      break;
    case 'price':
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
      break;
    case 'article':
      if (!isNonEmptyString(payload.slug)) errors.push(`${path}.slug: expected a non-empty string`);
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

/** Validates the published content bundle: one `site` singleton plus entity lists. */
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

  const highlights = collect('highlights', 'highlight');
  const services = collect('services', 'service');
  const steps = collect('steps', 'step');
  const works = collect('works', 'work');
  const prices = collect('prices', 'price');
  const articles = collect('articles', 'article');

  if (errors.length > 0 || !site.ok) return { ok: false, errors };

  return {
    ok: true,
    value: {
      site: site.value as SiteEntity,
      highlights,
      services,
      steps,
      works,
      prices,
      articles,
    },
  };
}

/* ------------------------------------------------------------------------ */
/* Stored resources (read path)                                              */
/* ------------------------------------------------------------------------ */

/**
 * A logical tombstone: the approved delete model (audit §8.2). Qortal has no
 * app-accessible QDN delete, so a delete republishes the **same** identifier with
 * `state: 'deleted'`, a `rev` increment and a minimal retained envelope. The
 * heavy kind-specific payload is dropped, which is why a tombstone is a distinct
 * type and not a "deleted entity" of its own kind.
 */
export interface TombstoneEntity {
  readonly schema: number;
  readonly id: string;
  readonly kind: EntityKind;
  readonly rev: number;
  readonly state: 'deleted';
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly deletedAt: number;
  readonly order: number;
  readonly title: string;
  readonly payload: null;
}

/** Builds the payload a delete publishes for `entity`. Never reuses an id. */
export function buildTombstone(entity: AnyEntity, now: number): TombstoneEntity {
  return {
    schema: SCHEMA_VERSION,
    id: entity.id,
    kind: entity.kind,
    rev: entity.rev + 1,
    state: 'deleted',
    createdAt: entity.createdAt,
    updatedAt: now,
    deletedAt: now,
    order: entity.order,
    title: entity.title,
    payload: null,
  };
}

export type StoredEntity =
  | { readonly status: 'active'; readonly entity: AnyEntity }
  | { readonly status: 'deleted'; readonly tombstone: TombstoneEntity }
  | { readonly status: 'invalid'; readonly errors: readonly string[] };

/**
 * Classifies one resource payload read from QDN.
 *
 * An `active` payload must satisfy the full active schema. A `deleted` payload is
 * validated only for identity and revision, so a tombstone is recognised (and
 * filtered) rather than reported as a corrupt entity. Any other `state`, an
 * unknown `schema` version or a malformed envelope is `invalid`: the read path
 * reports it and never guesses.
 */
export function readStoredEntity(value: unknown, path = 'entity'): StoredEntity {
  if (!isRecord(value)) {
    return { status: 'invalid', errors: [`${path}: expected an object`] };
  }

  if (value.schema !== SCHEMA_VERSION) {
    return {
      status: 'invalid',
      errors: [
        `${path}.schema: expected ${SCHEMA_VERSION}, received ${String(value.schema)} — this item needs a newer app`,
      ],
    };
  }

  if (value.state === 'deleted') {
    const errors: string[] = [];
    if (!isEntityKind(value.kind)) errors.push(`${path}.kind: unknown entity kind`);
    if (!isNonEmptyString(value.id)) {
      errors.push(`${path}.id: expected a non-empty identifier`);
    } else if (isEntityKind(value.kind) && !value.id.startsWith(identifierPrefixFor(value.kind))) {
      errors.push(`${path}.id: does not carry the ${value.kind} prefix`);
    } else if (!isValidIdentifier(value.id)) {
      errors.push(`${path}.id: expected lowercase [a-z0-9_-] and at most 60 characters`);
    }
    if (!isFiniteNumber(value.rev) || value.rev < 1) errors.push(`${path}.rev: expected >= 1`);
    if (!isFiniteNumber(value.deletedAt)) errors.push(`${path}.deletedAt: expected a number`);
    if (!isFiniteNumber(value.createdAt)) errors.push(`${path}.createdAt: expected a number`);
    if (!isFiniteNumber(value.updatedAt)) errors.push(`${path}.updatedAt: expected a number`);
    if (!isFiniteNumber(value.order)) errors.push(`${path}.order: expected a number`);
    if (typeof value.title !== 'string') errors.push(`${path}.title: expected a string`);

    if (errors.length > 0) return { status: 'invalid', errors };
    return { status: 'deleted', tombstone: value as unknown as TombstoneEntity };
  }

  const active = validateEntity(value, path);
  return active.ok
    ? { status: 'active', entity: active.value }
    : { status: 'invalid', errors: active.errors };
}
