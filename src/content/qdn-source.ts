/**
 * The QDN-backed content source.
 *
 * Read contract (audit §7, verified against Core `108bf191` and a live node):
 *
 *  - **the canonical entities are the authority**; there is no derived index in
 *    v1 because the approved volume (≤40 works, ≤30 articles, single digit to low
 *    double digits elsewhere) fits inside one bounded search page per kind;
 *  - discovery is a bounded, prefix-filtered `SEARCH_QDN_RESOURCES` per kind in
 *    that kind's own service (`mode: 'ALL'`, exact publisher name,
 *    `includeStatus`), then the payloads are hydrated with bounded concurrency;
 *  - every summary is re-filtered on the **exact** publishing name, service and
 *    identifier prefix before it is trusted;
 *  - `state: 'deleted'` payloads are tombstones: recognised, counted, never
 *    rendered and never resurrected;
 *  - a readable-but-unavailable payload is reported as partial content with a
 *    diagnostic, never as "no content".
 *
 * Seed fallback is deliberately narrow, and it is the only "fallback" this app
 * has:
 *
 *  1. **no publishing identity / no bridge** — the app cannot address any QDN
 *     resource (this is the local dev proxy and a plain browser), so it renders
 *     the shipped seed content and says why;
 *  2. **nothing published yet** — discovery answered and found no QWB resource at
 *     all, so the seed content is the site's designed pre-publication state;
 *  3. **the site singleton alone is unreadable** — the shell (brand, nav, hero,
 *     contact, footer copy) has to come from somewhere to render at all, so the
 *     seed shell is used with a diagnostic.
 *
 * It never substitutes seed entities for entities that exist but failed to load:
 * that would be a silent lie about published content. A total read failure is
 * reported as `error` and the app shows its content-error state instead of
 * pretending.
 */

import type { QortalBridge } from '../qortal/bridge';
import type { AppIdentity } from '../qortal/context';
import {
  DISCOVERY_PAGE_SIZE,
  FETCH_CONCURRENCY,
  MAX_DISCOVERY_PAGES,
  discoverByPrefix,
  fetchJsonResource,
  mapWithConcurrency,
} from '../qortal/read';
import type { ContentLoadResult, ContentSource } from './repository';
import { prepareBundle } from './repository';
import type { AnyEntity, ContentBundle, EntityKind, SiteEntity } from './schema';
import { identifierPrefixFor, readStoredEntity, serviceForKind } from './schema';
import { seedBundle } from './seed';

/**
 * The `site` singleton is addressed by its fixed identifier rather than searched:
 * one exact read is cheaper and cannot be diluted by prefix collisions.
 */
export const SITE_IDENTIFIER = 'qwb_site_v1';

/**
 * The site singleton's service. Entity payloads use the service the approved
 * model assigns to their kind (`schema.serviceForKind`) — `JSON` for everything
 * but articles, which live in `DOCUMENT`.
 */
export const SITE_SERVICE = serviceForKind('site');

/** Entity kinds discovered by prefix, in the order they are reported. */
export const DISCOVERED_KINDS = [
  'highlight',
  'service',
  'step',
  'work',
  'price',
  'article',
] as const satisfies readonly EntityKind[];

type DiscoveredKind = (typeof DISCOVERED_KINDS)[number];

export interface QdnSourceOptions {
  readonly app: AppIdentity;
  readonly bridge: QortalBridge;
  readonly seed?: ContentBundle;
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly concurrency?: number;
}

interface KindRead {
  readonly kind: DiscoveredKind;
  readonly entities: readonly AnyEntity[];
  readonly tombstones: number;
  readonly invalid: number;
  readonly unavailable: number;
  readonly truncated: boolean;
  readonly answered: boolean;
  readonly errors: readonly string[];
}

function emptyBundle(site: SiteEntity): ContentBundle {
  return { site, highlights: [], services: [], steps: [], works: [], prices: [], articles: [] };
}

function withKind(bundle: ContentBundle, read: KindRead): ContentBundle {
  switch (read.kind) {
    case 'highlight':
      return { ...bundle, highlights: read.entities as ContentBundle['highlights'] };
    case 'service':
      return { ...bundle, services: read.entities as ContentBundle['services'] };
    case 'step':
      return { ...bundle, steps: read.entities as ContentBundle['steps'] };
    case 'work':
      return { ...bundle, works: read.entities as ContentBundle['works'] };
    case 'price':
      return { ...bundle, prices: read.entities as ContentBundle['prices'] };
    case 'article':
      return { ...bundle, articles: read.entities as ContentBundle['articles'] };
  }
}

export function createQdnSource(options: QdnSourceOptions): ContentSource {
  const seed = options.seed ?? seedBundle;
  const pageSize = options.pageSize ?? DISCOVERY_PAGE_SIZE;
  const maxPages = options.maxPages ?? MAX_DISCOVERY_PAGES;
  const concurrency = options.concurrency ?? FETCH_CONCURRENCY;
  const name = options.app.name;

  async function readKind(kind: DiscoveredKind): Promise<KindRead> {
    const service = serviceForKind(kind);
    const discovery = await discoverByPrefix(
      options.bridge,
      { service, name, identifierPrefix: identifierPrefixFor(kind) },
      { pageSize, maxPages },
    );

    const errors = [...discovery.errors];
    const loaded = await mapWithConcurrency(discovery.summaries, concurrency, async (summary) => {
      const read = await fetchJsonResource(options.bridge, {
        service,
        name,
        identifier: summary.identifier,
      });
      if (!read.ok) {
        errors.push(`${summary.identifier}: ${read.error.message}`);
        return { status: 'unavailable' as const };
      }
      const stored = readStoredEntity(read.value, summary.identifier);
      if (stored.status === 'deleted') return { status: 'deleted' as const };
      if (stored.status === 'invalid') {
        errors.push(`${summary.identifier}: ${stored.errors.join('; ')}`);
        return { status: 'invalid' as const };
      }
      if (stored.entity.kind !== kind) {
        errors.push(
          `${summary.identifier}: the payload is a ${stored.entity.kind} but was discovered as a ${kind}`,
        );
        return { status: 'invalid' as const };
      }
      return { status: 'active' as const, entity: stored.entity as AnyEntity };
    });

    return {
      kind,
      entities: loaded.flatMap((entry) => (entry.status === 'active' ? [entry.entity] : [])),
      tombstones: loaded.filter((entry) => entry.status === 'deleted').length,
      invalid: loaded.filter((entry) => entry.status === 'invalid').length,
      unavailable: loaded.filter((entry) => entry.status === 'unavailable').length,
      truncated: discovery.truncated,
      answered: discovery.answered,
      errors,
    };
  }

  async function readSite(): Promise<{
    site: SiteEntity | null;
    detail: string | null;
    failure: 'unavailable' | 'transport' | 'malformed' | null;
  }> {
    const read = await fetchJsonResource(options.bridge, {
      service: SITE_SERVICE,
      name,
      identifier: SITE_IDENTIFIER,
    });
    if (!read.ok) return { site: null, detail: read.error.message, failure: read.error.kind };
    const stored = readStoredEntity(read.value, SITE_IDENTIFIER);
    if (stored.status === 'deleted') {
      return { site: null, detail: 'the site singleton is tombstoned', failure: null };
    }
    if (stored.status === 'invalid') {
      return { site: null, detail: stored.errors.join('; '), failure: 'malformed' };
    }
    if (stored.entity.kind !== 'site') {
      return {
        site: null,
        detail: `expected the site singleton, received a ${stored.entity.kind}`,
        failure: 'malformed',
      };
    }
    return { site: stored.entity, detail: null, failure: null };
  }

  async function load(): Promise<ContentLoadResult> {
    if (name === '') {
      return {
        status: 'ready',
        bundle: prepareBundle(seed),
        diagnostics: [
          'seed-fallback: no publishing identity is injected in this context (_qdnName is empty), so QDN content cannot be read',
        ],
      };
    }

    if (!options.bridge.available) {
      return {
        status: 'ready',
        bundle: prepareBundle(seed),
        diagnostics: [
          'seed-fallback: this document has no Qortal bridge, so the published content cannot be read',
        ],
      };
    }

    const site = await readSite();
    const kinds = await Promise.all(DISCOVERED_KINDS.map((kind) => readKind(kind)));

    const diagnostics: string[] = [];
    const anyAnswer = kinds.some((read) => read.answered);
    if (!anyAnswer && site.site === null) {
      diagnostics.push(
        `read-failed: no QDN resource could be searched or read under "${name}" (${site.detail ?? 'no search answered'})`,
      );
      return { status: 'error', bundle: seed, diagnostics };
    }

    let bundle = site.site === null ? emptyBundle(seed.site) : emptyBundle(site.site);
    if (site.site === null) {
      diagnostics.push(
        `site-singleton-unavailable: ${site.detail ?? 'not served'}; the seed shell is being rendered`,
      );
    }

    let entityCount = 0;
    let tombstones = 0;
    let damaged = 0;
    let searchErrors = 0;

    for (const read of kinds) {
      bundle = withKind(bundle, read);
      entityCount += read.entities.length;
      tombstones += read.tombstones;
      damaged += read.invalid + read.unavailable;
      if (!read.answered) searchErrors += 1;
      for (const error of read.errors) diagnostics.push(`${read.kind}: ${error}`);
      if (read.truncated) {
        diagnostics.push(
          `${read.kind}: discovery stopped at the page budget (${String(pageSize * maxPages)}); more items exist on the node`,
        );
      }
    }

    /*
     * Seed fallback 2: the node answered every search and the site singleton is
     * simply not published — this is the genuine pre-publication state. A site
     * read that failed for any other reason (transport, malformed, tombstoned) is
     * *not* an empty site, and is reported as partial below.
     */
    const simplyUnpublished = site.failure === 'unavailable';
    if (
      entityCount === 0 &&
      tombstones === 0 &&
      site.site === null &&
      searchErrors === 0 &&
      simplyUnpublished
    ) {
      return {
        status: 'ready',
        bundle: prepareBundle(seed),
        diagnostics: [
          `nothing-published: no QWB resource is published under "${name}" yet; rendering the shipped seed content`,
        ],
      };
    }

    if (tombstones > 0) {
      diagnostics.push(
        `tombstones: ${String(tombstones)} deleted item(s) were filtered out of every read path`,
      );
    }

    const partial = damaged > 0 || searchErrors > 0 || (site.site === null && !simplyUnpublished);
    return {
      status: partial ? 'partial' : 'ready',
      bundle: prepareBundle(bundle),
      diagnostics,
    };
  }

  return {
    id: 'qdn',
    describe: `QDN entities published by "${name}"${options.bridge.available ? '' : ' (no bridge)'}`,
    load,
  };
}
