/**
 * A blunt guard against a Phase-2 UI that could claim a save or publish.
 *
 * It scans the shipped application source (through Vite's raw import, so no node
 * type definitions are needed) for write-capable bridge actions and for the
 * persistence APIs the audit forbade for owner state, and fails when they appear
 * outside the explicitly allow-listed transport modules.
 */

const SOURCES = import.meta.glob('../../src/**/*.{ts,css}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Readonly<Record<string, string>>;

const WRITE_ACTIONS = ['PUBLISH_QDN_RESOURCE', 'PUBLISH_MULTIPLE_QDN_RESOURCES'];
const PERSISTENCE_APIS = ['localStorage', 'sessionStorage', 'indexedDB'];
/** The transport boundary where write vocabulary is allowed to exist (Phase 3). */
const ALLOWED_WRITE_FILES = ['src/qortal/bridge.ts', 'src/qortal/write.ts'];

/** Comments explain these rules; only executable code must be scanned. */
function stripComments(contents: string): string {
  return contents.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function normalise(path: string): string {
  return path.replace(/^(\.\.\/)+/, '');
}

export interface ClaimScan {
  readonly writeActionsOutsideAllowList: readonly string[];
  readonly persistenceUsage: readonly string[];
}

export function scanForWrittenClaims(): ClaimScan {
  const writeActions: string[] = [];
  const persistence: string[] = [];

  for (const [path, raw] of Object.entries(SOURCES)) {
    const file = normalise(path);
    const contents = stripComments(raw);

    if (
      WRITE_ACTIONS.some((action) => contents.includes(action)) &&
      !ALLOWED_WRITE_FILES.includes(file)
    ) {
      writeActions.push(file);
    }
    if (PERSISTENCE_APIS.some((api) => contents.includes(api))) persistence.push(file);
  }

  return {
    writeActionsOutsideAllowList: writeActions.sort(),
    persistenceUsage: persistence.sort(),
  };
}

/** `true` when any surface could claim a written result. */
export function provideWrittenClaim(): boolean {
  const scan = scanForWrittenClaims();
  return scan.writeActionsOutsideAllowList.length > 0 || scan.persistenceUsage.length > 0;
}
