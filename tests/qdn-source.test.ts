/**
 * The QDN-backed content source: bounded discovery, exact publisher filtering,
 * tombstone handling, partial/error reporting and the three narrow seed fallbacks.
 *
 * Everything here runs through the real bridge wrapper and the real read modules
 * against the scripted node (`tests/support/qdn.ts`), so a regression in a request
 * field (the camelCase names, `mode: 'ALL'`, `prefix`, `exactMatchNames`) fails a
 * test rather than silently returning unfiltered or truncated data.
 */

import { describe, expect, it } from 'vitest';

import type { AppIdentity } from '../src/qortal/context';
import { readAppIdentity } from '../src/qortal/context';
import { createBridge } from '../src/qortal/bridge';
import type { QortalRequest } from '../src/qortal/bridge';
import {
  createQdnSource,
  DISCOVERED_KINDS,
  SITE_IDENTIFIER,
  SITE_SERVICE,
} from '../src/content/qdn-source';
import { buildEntityPublishRequest, publishEntity } from '../src/qortal/publish';
import {
  identifierPrefixFor,
  isEntityKind,
  serviceForIdentifier,
  serviceForKind,
} from '../src/content/schema';
import { createSeedSource } from '../src/content/repository';
import type { AnyEntity, ContentBundle, EntityKind } from '../src/content/schema';
import { createFakeNode, seedStoredEntities } from './support/qdn';
import { buildTombstone } from '../src/content/schema';

const OWNER_NAME = 'Qortal Web Builders';

const APP: AppIdentity = readAppIdentity({
  _qdnContext: 'render',
  _qdnService: 'WEBSITE',
  _qdnName: OWNER_NAME,
  _qdnIdentifier: 'default',
  qortalRequest: () => Promise.resolve({}),
});

async function seedBundle(): Promise<ContentBundle> {
  const loaded = await createSeedSource().load();
  if (loaded.status === 'error') throw new Error('the shipped seed content is invalid');
  return loaded.bundle;
}

function entitiesOf(bundle: ContentBundle, kind: EntityKind): readonly AnyEntity[] {
  switch (kind) {
    case 'site':
      return [bundle.site];
    case 'highlight':
      return bundle.highlights;
    case 'service':
      return bundle.services;
    case 'step':
      return bundle.steps;
    case 'work':
      return bundle.works;
    case 'price':
      return bundle.prices;
    case 'article':
      return bundle.articles;
  }
}

function searches(calls: readonly QortalRequest[]): readonly QortalRequest[] {
  return calls.filter((call) => call.action === 'SEARCH_QDN_RESOURCES');
}

describe('QDN content source', () => {
  it('discovers every kind with the exact publisher, service and prefix filters', async () => {
    const node = createFakeNode({ name: OWNER_NAME, entities: await seedStoredEntities() });
    const source = createQdnSource({ app: APP, bridge: node.bridge });

    const result = await source.load();
    const seed = await seedBundle();
    expect(result.status).toBe('ready');
    expect(result.bundle.highlights).toHaveLength(seed.highlights.length);
    expect(result.bundle.services).toHaveLength(seed.services.length);
    expect(result.bundle.steps).toHaveLength(seed.steps.length);
    expect(result.bundle.works).toHaveLength(seed.works.length);
    expect(result.bundle.prices).toHaveLength(seed.prices.length);
    expect(result.bundle.articles).toHaveLength(seed.articles.length);
    expect(result.bundle.site.id).toBe(seed.site.id);

    const issued = searches(node.calls());
    expect(issued).toHaveLength(DISCOVERED_KINDS.length);
    for (const call of issued) {
      // camelCase only: the node's own lowercase names are silently ignored.
      expect(String(call.service)).toMatch(/^(JSON|DOCUMENT)$/);
      expect(call.names).toEqual([OWNER_NAME]);
      expect(call.exactMatchNames).toBe(true);
      expect(call.prefix).toBe(true);
      // LATEST (the node default) keeps one row per (name, service).
      expect(call.mode).toBe('ALL');
      expect(call.includeStatus).toBe(true);
      expect(call.excludeBlocked).toBe(true);
    }
    const prefixes = issued.map((call) => String(call.identifier));
    expect(prefixes).toContain('qwb_hl_');
    expect(prefixes).toContain('qwb_svc_');
    expect(prefixes).toContain('qwb_step_');
    expect(prefixes).toContain('qwb_work_');
    expect(prefixes).toContain('qwb_price_');
    expect(prefixes).toContain('qwb_post_');
    // The site singleton is one exact read, not a search.
    const siteRead = node
      .calls()
      .find((call) => call.action === 'FETCH_QDN_RESOURCE' && call.identifier === SITE_IDENTIFIER);
    expect(siteRead).toBeDefined();
  });

  it('addresses the site singleton at the identifier the shell is published under', async () => {
    // The site slice editor republishes `bundle.site.id`; the read path reads
    // `SITE_IDENTIFIER`. If the shipped shell ever changes its identifier, a site
    // edit would publish to a coordinate nothing reads — a silent "looks saved".
    const seed = await seedBundle();
    expect(seed.site.id).toBe(SITE_IDENTIFIER);
  });

  it('reads every kind in the same service the write path publishes it to', async () => {
    // A drift here would publish an entity that discovery never looks for.
    const seed = await seedBundle();
    const byPrefix = new Map<EntityKind, string>();
    for (const kind of DISCOVERED_KINDS) {
      const entity = entitiesOf(seed, kind)[0];
      if (entity === undefined) throw new Error(`the seed has no ${kind}`);
      const built = buildEntityPublishRequest(entity, OWNER_NAME);
      if (!built.ok) throw new Error(`the seed ${kind} is not publishable: ${built.reason}`);
      expect(built.request.service).toBe(serviceForKind(kind));
      byPrefix.set(kind, built.request.service);
    }

    const node = createFakeNode({ name: OWNER_NAME, entities: await seedStoredEntities() });
    await createQdnSource({ app: APP, bridge: node.bridge }).load();
    for (const call of searches(node.calls())) {
      const prefix = String(call.identifier);
      const kind = DISCOVERED_KINDS.find((candidate) => identifierPrefixFor(candidate) === prefix);
      if (kind === undefined) throw new Error(`unexpected discovery prefix ${prefix}`);
      expect(call.service).toBe(byPrefix.get(kind));
    }

    // Reading one back uses the service its own identifier implies.
    expect(serviceForIdentifier(seed.site.id)).toBe(SITE_SERVICE);
    for (const kind of DISCOVERED_KINDS) {
      const entity = entitiesOf(seed, kind)[0];
      if (entity === undefined) throw new Error(`the seed has no ${kind}`);
      expect(serviceForIdentifier(entity.id)).toBe(serviceForKind(kind));
    }
  });

  it('publishes articles into DOCUMENT and back-reads them from there', async () => {
    // The approved kind table (§6.1) puts the prose kind in DOCUMENT; JSON's
    // 25 KB ceiling is the reason.
    const article = entitiesOf(await seedBundle(), 'article')[0];
    if (article === undefined || !isEntityKind(article.kind)) throw new Error('no seed article');
    expect(article.kind).toBe('article');
    expect(serviceForKind('article')).toBe('DOCUMENT');

    const built = buildEntityPublishRequest(article, OWNER_NAME);
    if (!built.ok) throw new Error(built.reason);
    expect(built.request.service).toBe('DOCUMENT');

    const node = createFakeNode({ name: OWNER_NAME, entities: await seedStoredEntities() });
    const written = await publishEntity(
      { bridge: node.bridge, name: OWNER_NAME, verifyAttempts: 1, verifyDelayMs: 0 },
      article,
    );
    expect(written.availability).toBe('verified');
    const reads = node
      .calls()
      .filter((call) => call.action === 'FETCH_QDN_RESOURCE' && call.identifier === article.id);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((call) => call.service === 'DOCUMENT')).toBe(true);
  });

  it('ignores resources published under a different name', async () => {
    const seed = await seedBundle();
    const foreign = seed.highlights[0];
    if (foreign === undefined) throw new Error('no seed highlight');

    // The node answers with a summary carrying somebody else's publishing name,
    // even though the request asked for this app's name: the post-filter is the
    // authority, not the node query.
    const bridge = createBridge({
      qortalRequest: (request: QortalRequest): Promise<unknown> => {
        if (request.action === 'SEARCH_QDN_RESOURCES') {
          return Promise.resolve([
            {
              name: 'Someone Else',
              service: 'JSON',
              identifier: foreign.id,
              size: 512,
              created: 1,
              updated: 1,
              status: { id: 'READY' },
            },
          ]);
        }
        if (request.action === 'FETCH_QDN_RESOURCE') {
          // Our own site singleton is genuinely not published in this scenario.
          if (request.identifier === SITE_IDENTIFIER) {
            return Promise.reject({ error: 'Data unavailable. Please try again later.' });
          }
          return Promise.resolve(foreign);
        }
        if (request.action === 'GET_USER_ACCOUNT') return Promise.resolve({ address: 'QOwner' });
        if (request.action === 'GET_ACCOUNT_NAMES') return Promise.resolve([{ name: OWNER_NAME }]);
        return Promise.reject(new Error(`unexpected action ${String(request.action)}`));
      },
    });

    const source = createQdnSource({ app: APP, bridge });
    const result = await source.load();
    // Nothing of ours exists, so this is the genuine pre-publication state.
    expect(result.status).toBe('ready');
    expect(result.diagnostics.join(' ')).toContain('nothing-published');
    expect(result.bundle.highlights).toHaveLength(seed.highlights.length);
  });

  it('filters a tombstone out of the public content and says so', async () => {
    const seed = await seedBundle();
    const deleted = seed.highlights[0];
    if (deleted === undefined) throw new Error('no seed highlight');
    const rest = (await seedStoredEntities()).filter((entity) => entity.id !== deleted.id);

    const node = createFakeNode({
      name: OWNER_NAME,
      entities: [
        ...rest,
        buildTombstone(deleted, 1_700_000_999_000) as unknown as Record<string, unknown>,
      ],
    });
    const source = createQdnSource({ app: APP, bridge: node.bridge });
    const result = await source.load();

    expect(result.bundle.highlights.map((entity) => entity.id)).not.toContain(deleted.id);
    expect(result.bundle.highlights).toHaveLength(seed.highlights.length - 1);
    expect(result.diagnostics.join(' ')).toContain('tombstones: 1');
  });

  it('reports a damaged payload as partial and never substitutes the seed entity', async () => {
    const seed = await seedBundle();
    const damaged = seed.highlights[0];
    if (damaged === undefined) throw new Error('no seed highlight');
    const entities = (await seedStoredEntities()).map((entity) =>
      entity.id === damaged.id ? { ...entity, title: '' } : entity,
    );

    const node = createFakeNode({ name: OWNER_NAME, entities });
    const source = createQdnSource({ app: APP, bridge: node.bridge });
    const result = await source.load();

    expect(result.status).toBe('partial');
    expect(result.diagnostics.join(' ')).toContain(damaged.id);
    expect(result.bundle.highlights).toHaveLength(seed.highlights.length - 1);
    expect(result.bundle.highlights.map((entity) => entity.id)).not.toContain(damaged.id);
  });

  it('reports an unreadable payload as partial rather than as empty content', async () => {
    const seed = await seedBundle();
    const lagging = seed.highlights[0];
    if (lagging === undefined) throw new Error('no seed highlight');

    const node = createFakeNode({
      name: OWNER_NAME,
      entities: await seedStoredEntities(),
      lagging: [lagging.id],
    });
    const source = createQdnSource({ app: APP, bridge: node.bridge });
    const result = await source.load();

    expect(result.status).toBe('partial');
    expect(result.diagnostics.join(' ')).toContain(lagging.id);
    expect(result.bundle.highlights).toHaveLength(seed.highlights.length - 1);
  });

  it('renders the seed shell when the site singleton is not readable but entities are', async () => {
    const seed = await seedBundle();
    const entities = (await seedStoredEntities()).filter((entity) => entity.id !== seed.site.id);

    const node = createFakeNode({ name: OWNER_NAME, entities });
    const source = createQdnSource({ app: APP, bridge: node.bridge });
    const result = await source.load();

    expect(result.status).toBe('ready');
    expect(result.diagnostics.join(' ')).toContain('site-singleton-unavailable');
    expect(result.bundle.site.id).toBe(seed.site.id);
    // The published entities are still used: only the shell falls back.
    expect(result.bundle.highlights).toHaveLength(seed.highlights.length);
  });

  it('fails closed when nothing can be read at all', async () => {
    const bridge = createBridge({
      qortalRequest: (request: QortalRequest): Promise<unknown> =>
        Promise.reject(new Error(`transport down for ${String(request.action)}`)),
    });
    const source = createQdnSource({ app: APP, bridge });
    const result = await source.load();

    expect(result.status).toBe('error');
    expect(result.diagnostics.join(' ')).toContain('read-failed');
  });

  it('flags a discovery that hit the page budget', async () => {
    const seed = await seedBundle();
    const node = createFakeNode({ name: OWNER_NAME, entities: await seedStoredEntities() });
    const source = createQdnSource({ app: APP, bridge: node.bridge, pageSize: 2, maxPages: 1 });
    const result = await source.load();

    expect(result.diagnostics.join(' ')).toContain('discovery stopped at the page budget');
    expect(result.bundle.works.length).toBeLessThan(seed.works.length);
  });

  it('renders the shipped seed content when there is no publishing identity', async () => {
    const node = createFakeNode({ name: OWNER_NAME, entities: await seedStoredEntities() });
    const anonymous = readAppIdentity({ _qdnContext: 'proxy', _qdnName: '' });
    const source = createQdnSource({ app: anonymous, bridge: node.bridge });
    const result = await source.load();

    expect(result.status).toBe('ready');
    expect(result.diagnostics.join(' ')).toContain('no publishing identity');
    expect(node.calls()).toHaveLength(0);
  });

  it('renders the shipped seed content when there is no bridge', async () => {
    const seed = await seedBundle();
    const source = createQdnSource({ app: APP, bridge: createBridge({}) });
    const result = await source.load();

    expect(result.status).toBe('ready');
    expect(result.diagnostics.join(' ')).toContain('no Qortal bridge');
    expect(result.bundle.highlights).toHaveLength(seed.highlights.length);
  });

  it('renders the shipped seed content when nothing is published under this name', async () => {
    const seed = await seedBundle();
    const node = createFakeNode({ name: OWNER_NAME });
    const source = createQdnSource({ app: APP, bridge: node.bridge });
    const result = await source.load();

    expect(result.status).toBe('ready');
    expect(result.diagnostics.join(' ')).toContain('nothing-published');
    expect(result.bundle.highlights).toHaveLength(seed.highlights.length);
    expect(result.bundle.site.id).toBe(seed.site.id);
  });
});
