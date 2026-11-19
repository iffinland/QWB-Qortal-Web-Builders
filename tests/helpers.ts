import type { QdnReader } from '../src/qortal/adapter';
import { QdnHttpError } from '../src/qortal/adapter';
import { seedBundle } from '../src/content/seed';
import type { AnyEntity } from '../src/content/schema';

/** Every seed entity, flattened in publication order. */
export function allSeedEntities(): AnyEntity[] {
  const b = seedBundle;
  return [b.site, ...b.services, ...b.steps, ...b.works, ...b.prices, ...b.articles];
}

/**
 * In-memory QDN reader. `store` plays the published resources; tests mutate it to
 * simulate remote state. Structure matches `QdnReader` exactly.
 */
export function memoryReader(
  store: Map<string, unknown>,
  options: { searchError?: Error } = {},
): QdnReader {
  return {
    searchIdentifiers: ({ prefix }) => {
      if (options.searchError !== undefined) return Promise.reject(options.searchError);
      return Promise.resolve([...store.keys()].filter((id) => id.startsWith(prefix)));
    },
    fetchJson: (_name, identifier) =>
      Promise.resolve(store.has(identifier) ? structuredClone(store.get(identifier)) : null),
  };
}

export function publishedStore(
  entities: readonly AnyEntity[] = allSeedEntities(),
): Map<string, unknown> {
  return new Map(entities.map((entity) => [entity.id, structuredClone(entity)]));
}

export { QdnHttpError };
