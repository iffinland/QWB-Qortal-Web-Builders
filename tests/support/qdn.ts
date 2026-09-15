/**
 * A scripted stand-in for one Qortal node, exercised through the **real** bridge
 * wrapper and the real read/publish modules.
 *
 * It reproduces the shim behaviours the app depends on (Core `108bf191`
 * `q-apps.js`): JSON resources are answered as already-parsed objects, binary
 * reads honour `encoding: 'base64'`, search is an array of summaries filtered on
 * camelCase fields, a missing resource answers the node's **live** 404 body
 * (`{"error":1401,"message":"Couldn't find PUT transaction …"}` — captured from the
 * local node, not remembered), and a publish resolves with a signature. It is a
 * contract fake, not a mock of the app's own modules.
 */

import type { QortalBridge, QortalRequest } from '../../src/qortal/bridge';
import { createBridge } from '../../src/qortal/bridge';
import { createSeedSource } from '../../src/content/repository';
import { isEntityKind, serviceForKind } from '../../src/content/schema';

/** The services that carry an entity payload rather than media bytes. */
function isEntityService(service: string): boolean {
  return service === 'JSON' || service === 'DOCUMENT';
}

export function base64ToText(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

function textToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export interface FakeStoredEntity {
  readonly identifier: string;
  readonly service: string;
  readonly payload: Record<string, unknown>;
  readonly created: number;
}

export interface FakeMedia {
  readonly identifier: string;
  readonly service: string;
  readonly data64: string;
  readonly created: number;
}

export interface FakeNodeOptions {
  readonly name: string;
  readonly entities?: readonly Record<string, unknown>[];
  readonly media?: readonly {
    readonly identifier: string;
    readonly bytes: Uint8Array;
    readonly mimeType: string;
  }[];
  /** Identifiers whose reads fail as "data unavailable" (node has not caught up). */
  readonly lagging?: readonly string[];
  /** Reject publishes with this value instead of signing them. */
  readonly publishError?: unknown;
  /** Store a published payload immediately (default) or leave the node behind. */
  readonly autoStore?: boolean;
}

export interface FakeNode {
  readonly bridge: QortalBridge;
  calls(): readonly QortalRequest[];
  actions(): readonly string[];
  publishes(): readonly QortalRequest[];
  stored(): readonly FakeStoredEntity[];
  served(): readonly FakeStoredEntity[];
  media(): readonly FakeMedia[];
  /** Makes reads for `identifier` fail (the node has not caught up yet). */
  setLagging(identifier: string | null): void;
  setPublishError(value: unknown): void;
  remove(identifier: string): void;
}

/**
 * The node's real 404 body for a resource it does not serve, captured from the
 * local node: `{"error":1401,"message":"Couldn't find PUT transaction for name …"}`.
 */
const UNAVAILABLE = {
  error: 1401,
  message:
    "Couldn't find PUT transaction for name Qortal Web Builders, service JSON and identifier unknown",
};

export function createFakeNode(options: FakeNodeOptions): FakeNode {
  const name = options.name;
  const autoStore = options.autoStore !== false;
  const entries: FakeStoredEntity[] = [];
  const mediaEntries: FakeMedia[] = [];
  const calls: QortalRequest[] = [];
  let lagging: string | null = options.lagging?.[0] ?? null;
  let publishError: unknown = options.publishError;

  const laggingSet = new Set(options.lagging ?? []);
  let publishCount = 0;

  const addEntity = (payload: Record<string, unknown>, created: number): void => {
    const identifier = String(payload.id);
    // The service follows the kind, exactly as the write path assigns it — an
    // article therefore lives in `DOCUMENT`, not in `JSON`.
    const kind = payload.kind;
    const service = isEntityKind(kind) ? serviceForKind(kind) : 'JSON';
    entries.push({ identifier, service, payload, created });
  };

  options.entities?.forEach((payload, index) => {
    addEntity(payload, 1_700_000_000_000 + index);
  });

  options.media?.forEach((entry, index) => {
    mediaEntries.push({
      identifier: entry.identifier,
      service: entry.bytes.length <= 500 * 1024 ? 'THUMBNAIL' : 'IMAGE',
      data64: bytesToBase64(entry.bytes),
      created: 1_700_000_000_000 + index,
    });
  });

  function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function summaryFor(entry: FakeStoredEntity | FakeMedia): Record<string, unknown> {
    return {
      name,
      service: entry.service,
      identifier: entry.identifier,
      size: entry.service === 'JSON' ? 512 : 1024,
      created: entry.created,
      updated: entry.created,
      latestSignature: `sig-${entry.identifier}`,
      status: {
        status: laggingSet.has(entry.identifier) ? 'DOWNLOADING' : 'READY',
        id: laggingSet.has(entry.identifier) ? 'DOWNLOADING' : 'READY',
      },
    };
  }

  const bridge = createBridge({
    qortalRequest: (request: QortalRequest): Promise<unknown> => {
      calls.push(request);
      const identifier = typeof request.identifier === 'string' ? request.identifier : null;

      switch (request.action) {
        case 'SEARCH_QDN_RESOURCES': {
          const service = String(request.service);
          const prefix = typeof request.identifier === 'string' ? request.identifier : '';
          const limit = typeof request.limit === 'number' ? request.limit : 50;
          const offset = typeof request.offset === 'number' ? request.offset : 0;
          const candidates = [...entries, ...mediaEntries]
            .filter((entry) => entry.service === service && entry.identifier.startsWith(prefix))
            .filter(
              () => (request.names as readonly string[] | undefined)?.includes(name) !== false,
            )
            .sort((a, b) => b.created - a.created);
          if (request.reverse !== true) candidates.reverse();
          return Promise.resolve(candidates.slice(offset, offset + limit).map(summaryFor));
        }

        case 'FETCH_QDN_RESOURCE': {
          if (identifier !== null && laggingSet.has(identifier)) return Promise.reject(UNAVAILABLE);
          const media = mediaEntries.find((entry) => entry.identifier === identifier);
          if (media !== undefined && String(request.service) === media.service) {
            return Promise.resolve(media.data64);
          }
          const entity = entries.find((entry) => entry.identifier === identifier);
          if (entity !== undefined && String(request.service) === entity.service) {
            // The shim JSON-parses the response, so a JSON resource arrives parsed.
            return Promise.resolve(entity.payload);
          }
          return Promise.reject(UNAVAILABLE);
        }

        case 'GET_QDN_RESOURCE_STATUS': {
          const known =
            entries.some((entry) => entry.identifier === identifier) ||
            mediaEntries.some((entry) => entry.identifier === identifier);
          if (!known) return Promise.reject(UNAVAILABLE);
          return Promise.resolve({
            status: identifier !== null && laggingSet.has(identifier) ? 'DOWNLOADING' : 'READY',
          });
        }

        case 'GET_USER_ACCOUNT':
          return Promise.resolve({ address: 'QOwnerAddress', publicKey: 'pk' });
        case 'GET_ACCOUNT_NAMES':
          return Promise.resolve([{ name }, { name: 'Q-Website' }]);

        case 'PUBLISH_QDN_RESOURCE': {
          if (publishError !== undefined) return Promise.reject(publishError);
          const data64 = typeof request.data64 === 'string' ? request.data64 : '';
          publishCount += 1;
          if (autoStore && identifier !== null) {
            if (isEntityService(String(request.service))) {
              const payload = JSON.parse(base64ToText(data64)) as Record<string, unknown>;
              const existing = entries.findIndex(
                (entry) =>
                  entry.identifier === identifier && entry.service === String(request.service),
              );
              const record: FakeStoredEntity = {
                identifier,
                service: String(request.service),
                payload,
                created: existing === -1 ? Date.now() : (entries[existing]?.created ?? Date.now()),
              };
              if (existing === -1) entries.push(record);
              else entries[existing] = record;
            } else {
              const existing = mediaEntries.findIndex(
                (entry) =>
                  entry.identifier === identifier && entry.service === String(request.service),
              );
              const record: FakeMedia = {
                identifier,
                service: String(request.service),
                data64,
                created: Date.now(),
              };
              if (existing === -1) mediaEntries.push(record);
              else mediaEntries[existing] = record;
            }
          }
          return Promise.resolve({
            signature: `signature-${String(publishCount)}`,
            type: 'ARBITRARY',
          });
        }

        default:
          return Promise.reject(new Error(`unexpected action ${request.action}`));
      }
    },
  });

  return {
    bridge,
    calls: () => calls,
    actions: () => calls.map((call) => call.action),
    publishes: () => calls.filter((call) => call.action === 'PUBLISH_QDN_RESOURCE'),
    stored: () => entries,
    served: () => entries.filter((entry) => !laggingSet.has(entry.identifier)),
    media: () => mediaEntries,
    setLagging(next) {
      if (lagging === next) return;
      if (lagging !== null) laggingSet.delete(lagging);
      lagging = next;
      if (next !== null) laggingSet.add(next);
    },
    setPublishError(value) {
      publishError = value;
    },
    remove(identifier) {
      const index = entries.findIndex((entry) => entry.identifier === identifier);
      if (index !== -1) entries.splice(index, 1);
    },
  };
}

export { textToBase64 };

/**
 * Every shipped seed entity as JSON-round-tripped plain data, i.e. exactly what a
 * QDN read would hand the read path. Used to give the fake node a realistic
 * multi-entity publisher instead of a single hand-written payload.
 */
export async function seedStoredEntities(): Promise<readonly Record<string, unknown>[]> {
  const loaded = await createSeedSource().load();
  if (loaded.status === 'error') throw new Error('the shipped seed content is invalid');
  const bundle = loaded.bundle;
  const stored = <T>(value: T): Record<string, unknown> =>
    JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  return [
    stored(bundle.site),
    ...bundle.highlights.map(stored),
    ...bundle.services.map(stored),
    ...bundle.steps.map(stored),
    ...bundle.works.map(stored),
    ...bundle.prices.map(stored),
    ...bundle.articles.map(stored),
  ];
}
