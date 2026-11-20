/**
 * QDN-backed content source.
 *
 * Reads the published `JSON` resources of the publishing name whose identifiers
 * start with `qwb_` (public, no authentication), validates each one, and builds
 * the bundle. Failures degrade in a controlled way:
 *  - a single invalid entity is skipped and reported in `diagnostics` (`partial`);
 *  - a missing site singleton, an unreachable node, or a bundle-level conflict
 *    falls back to the built-in seed (`origin: 'seed'`, `partial`), with the reason.
 * The views never see an unvalidated entity.
 */

import type { QdnReader } from '../qortal/adapter';
import type { ContentLoadResult, ContentSource } from './repository';
import { publicBundle, sortBundle } from './repository';
import type { AnyEntity, ContentBundle, SiteEntity } from './schema';
import { SCHEMA_VERSION, validateBundle, validateEntity } from './schema';

export interface QdnSourceOptions {
  readonly reader: QdnReader;
  readonly name: string;
  readonly prefix: string;
  readonly limit: number;
  /** Used whenever the published content cannot be read as a whole. */
  readonly fallback: ContentSource;
  /** Concurrent payload fetches per batch. */
  readonly batchSize?: number;
}

const SITE_IDENTIFIER = 'qwb_site_v1';

export function createQdnSource(options: QdnSourceOptions): ContentSource {
  const batchSize = Math.max(1, options.batchSize ?? 6);

  const fallbackWith = async (
    reason: string[],
    published: readonly AnyEntity[] = [],
  ): Promise<ContentLoadResult> => {
    const seed = await options.fallback.load();
    const replace = <E extends AnyEntity>(base: readonly E[], kind: E['kind']): E[] => {
      const remote = published.filter((entity) => entity.kind === kind) as E[];
      const byId = new Map(base.map((entity) => [entity.id, entity]));
      remote.forEach((entity) => byId.set(entity.id, entity));
      return [...byId.values()];
    };
    const remoteSite = published.find((entity): entity is SiteEntity => entity.kind === 'site');
    const merged: ContentBundle = sortBundle({
      site: remoteSite ?? seed.raw.site,
      services: replace(seed.raw.services, 'service'),
      steps: replace(seed.raw.steps, 'step'),
      works: replace(seed.raw.works, 'work'),
      prices: replace(seed.raw.prices, 'price'),
      articles: replace(seed.raw.articles, 'article'),
    });
    return {
      ...seed,
      status: 'partial',
      raw: merged,
      bundle: publicBundle(merged),
      diagnostics: [...reason, ...seed.diagnostics],
      publishedIds: published.map((entity) => entity.id),
    };
  };

  return {
    id: 'qdn',
    describe: `published JSON resources under "${options.name}"`,
    async load() {
      let identifiers: readonly string[];
      try {
        identifiers = await options.reader.searchIdentifiers({
          name: options.name,
          prefix: options.prefix,
          limit: options.limit,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        return fallbackWith([`QDN is unavailable (${message}); showing built-in content.`]);
      }

      const diagnostics: string[] = [];
      const entities: AnyEntity[] = [];
      for (let start = 0; start < identifiers.length; start += batchSize) {
        const batch = identifiers.slice(start, start + batchSize);
        const settled = await Promise.allSettled(
          batch.map((identifier) => options.reader.fetchJson(options.name, identifier)),
        );
        settled.forEach((result, index) => {
          const identifier = batch[index] ?? '';
          if (result.status === 'rejected') {
            diagnostics.push(`${identifier}: could not be read`);
            return;
          }
          if (result.value === null) {
            diagnostics.push(`${identifier}: no longer published`);
            return;
          }
          const validation = validateEntity(result.value, identifier);
          if (!validation.ok) {
            diagnostics.push(...validation.errors.map((error) => `skipped: ${error}`));
            return;
          }
          if (validation.value.id !== identifier) {
            diagnostics.push(`${identifier}: payload id does not match its identifier; skipped`);
            return;
          }
          entities.push(validation.value);
        });
      }

      const site = entities.find(
        (entity): entity is SiteEntity => entity.kind === 'site' && entity.id === SITE_IDENTIFIER,
      );
      if (site === undefined) {
        return fallbackWith([
          ...diagnostics,
          'the site entity is not published yet; showing built-in content.',
        ], entities);
      }

      const seed = await options.fallback.load();
      const combined = <E extends AnyEntity>(base: readonly E[], kind: E['kind']): E[] => [
        ...base.filter((entity) => !identifiers.includes(entity.id)),
        ...entities.filter((entity) => entity.kind === kind) as E[],
      ];
      const candidate = {
        site,
        services: combined(seed.raw.services, 'service'),
        steps: combined(seed.raw.steps, 'step'),
        works: combined(seed.raw.works, 'work'),
        prices: combined(seed.raw.prices, 'price'),
        articles: combined(seed.raw.articles, 'article'),
      };
      const bundleValidation = validateBundle(candidate);
      if (!bundleValidation.ok) {
        return fallbackWith([
          ...diagnostics,
          ...bundleValidation.errors.map((error) => `bundle: ${error}`),
          'the published content is inconsistent; showing built-in content.',
        ], entities);
      }

      const bundle: ContentBundle = bundleValidation.value;
      const schemaSkew = entities.filter((entity) => entity.schema !== SCHEMA_VERSION).length;
      if (schemaSkew > 0) diagnostics.push(`${schemaSkew} entity(ies) use another schema version`);

      return {
        status: diagnostics.length > 0 ? 'partial' : 'ready',
        origin: 'qdn',
        bundle: publicBundle(bundle),
        raw: sortBundle(bundle),
        diagnostics,
        publishedIds: entities.map((entity) => entity.id),
      };
    },
  };
}
