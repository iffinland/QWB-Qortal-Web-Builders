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

  const fallbackWith = async (reason: string[]): Promise<ContentLoadResult> => {
    const seed = await options.fallback.load();
    return {
      ...seed,
      status: 'partial',
      diagnostics: [...reason, ...seed.diagnostics],
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
        ]);
      }

      const candidate = {
        site,
        services: entities.filter((entity) => entity.kind === 'service'),
        steps: entities.filter((entity) => entity.kind === 'step'),
        works: entities.filter((entity) => entity.kind === 'work'),
        prices: entities.filter((entity) => entity.kind === 'price'),
        articles: entities.filter((entity) => entity.kind === 'article'),
      };
      const bundleValidation = validateBundle(candidate);
      if (!bundleValidation.ok) {
        return fallbackWith([
          ...diagnostics,
          ...bundleValidation.errors.map((error) => `bundle: ${error}`),
          'the published content is inconsistent; showing built-in content.',
        ]);
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
      };
    },
  };
}
