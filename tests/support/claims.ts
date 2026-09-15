/**
 * The transport-boundary guard.
 *
 * Phase 1/2 could assert that no write vocabulary existed at all, because no write
 * path existed. Phase 3 has a real write path, so the invariant moves rather than
 * disappears: **every bridge action name and every direct `qortalRequest` access
 * must live inside `src/qortal/`**, the audited transport layer whose read/publish
 * modules are the only things allowed to talk to the host. A UI module that names
 * `PUBLISH_QDN_RESOURCE` or reaches for `window.qortalRequest` itself would be a
 * second, unverified write path — that is what this scan fails on.
 *
 * The second rule is unchanged: no persistence API may appear anywhere, because
 * owner state and content are network-derived and must never be cached locally.
 */

const SOURCES = import.meta.glob('../../src/**/*.{ts,css}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Readonly<Record<string, string>>;

const WRITE_ACTIONS = ['PUBLISH_QDN_RESOURCE', 'PUBLISH_MULTIPLE_QDN_RESOURCES'];
const BRIDGE_GLOBAL = 'qortalRequest';
const PERSISTENCE_APIS = ['localStorage', 'sessionStorage', 'indexedDB'];
/** The only directory allowed to name bridge actions or the injected global. */
const TRANSPORT_PREFIX = 'src/qortal/';

/** Comments explain these rules; only executable code must be scanned. */
function stripComments(contents: string): string {
  return contents.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function normalise(path: string): string {
  return path.replace(/^(\.\.\/)+/, '');
}

function isTransport(file: string): boolean {
  return file.startsWith(TRANSPORT_PREFIX);
}

export interface ClaimScan {
  readonly writeActionsOutsideAllowList: readonly string[];
  readonly directBridgeUsage: readonly string[];
  readonly persistenceUsage: readonly string[];
}

export function scanForWrittenClaims(): ClaimScan {
  const writeActions: string[] = [];
  const bridgeUsage: string[] = [];
  const persistence: string[] = [];

  for (const [path, raw] of Object.entries(SOURCES)) {
    const file = normalise(path);
    const contents = stripComments(raw);

    if (!isTransport(file)) {
      if (WRITE_ACTIONS.some((action) => contents.includes(action))) writeActions.push(file);
      if (contents.includes(BRIDGE_GLOBAL)) bridgeUsage.push(file);
    }
    if (PERSISTENCE_APIS.some((api) => contents.includes(api))) persistence.push(file);
  }

  return {
    writeActionsOutsideAllowList: writeActions.sort(),
    directBridgeUsage: bridgeUsage.sort(),
    persistenceUsage: persistence.sort(),
  };
}

/** `true` when a surface could bypass the verified write pipeline or persist state. */
export function provideWrittenClaim(): boolean {
  const scan = scanForWrittenClaims();
  return (
    scan.writeActionsOutsideAllowList.length > 0 ||
    scan.directBridgeUsage.length > 0 ||
    scan.persistenceUsage.length > 0
  );
}
