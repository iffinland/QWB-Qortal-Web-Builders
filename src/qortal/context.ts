/**
 * Qortal host context.
 *
 * Core injects nine globals into the app's own document
 * (`org.qortal.api.HTMLParser#addAdditionalHeaderTags`):
 * `_qdnContext`, `_qdnTheme`, `_qdnLang`, `_qdnService`, `_qdnName`,
 * `_qdnIdentifier`, `_qdnPath`, `_qdnBase`, `_qdnBaseWithPath`.
 *
 * `_qdnName` is the registered name that published the rendered resource: it is
 * the app's own publishing identity and therefore the only correct basis for
 * "who owns this app". It is never hardcoded.
 *
 * Bridge presence is probed on the app's **own** window only. The legacy
 * reference app walked `window.parent`/`window.top`; current Core injects
 * `/apps/q-apps.js` into the app document itself, so that probing is obsolete.
 *
 * Context kinds that can carry host-mediated calls (`render`) are separated
 * from read-only ones:
 *  - `render`    — the Hub's restricted render path; the Hub answers interactive
 *                  requests. The only interactive context.
 *  - `proxy`     — Hub developer-mode proxy. `_qdnName`/`_qdnIdentifier`/`_qdnBase`
 *                  are empty by construction, so owner mode cannot exist here.
 *  - `gateway`   — public gateway viewing. `q-apps-gateway.js` answers
 *                  interactive actions with an error object and shows a modal.
 *  - `domainMap` — Core's domain-mapped public serving path; no Hub is attached.
 */

export type HostContextKind = 'render' | 'proxy' | 'gateway' | 'domainMap' | 'unknown';

const KNOWN_CONTEXTS: readonly string[] = ['render', 'proxy', 'gateway', 'domainMap'];

/** Why owner mode cannot be established at all (as opposed to "not the owner"). */
export type OwnerModeBlockedReason =
  'no-bridge' | 'non-interactive-context' | 'empty-publishing-name';

/**
 * The subset of `globalThis` this module reads.
 *
 * The property names are the **exact** identifiers Core declares in
 * `HTMLParser#addAdditionalHeaderTags`
 * (`var _qdnContext="…"; var _qdnTheme="…"; … var _qdnBaseWithPath="…";`),
 * including the leading underscore. Reading an underscore-less variant silently
 * yields nothing, which is exactly the failure this naming documents.
 *
 * `qortalRequest` is declared by `/apps/q-apps.js` in the same document.
 *
 * Tests inject a plain object with these keys.
 */
export interface QdnGlobalScope {
  readonly _qdnContext?: unknown;
  readonly _qdnTheme?: unknown;
  readonly _qdnLang?: unknown;
  readonly _qdnService?: unknown;
  readonly _qdnName?: unknown;
  readonly _qdnIdentifier?: unknown;
  readonly _qdnPath?: unknown;
  readonly _qdnBase?: unknown;
  readonly _qdnBaseWithPath?: unknown;
  /** Present (a function) only when Core injected the app bridge. */
  readonly qortalRequest?: unknown;
}

/** The injected global names, in Core's declaration order. */
export const QDN_CONTEXT_GLOBAL_NAMES = [
  '_qdnContext',
  '_qdnTheme',
  '_qdnLang',
  '_qdnService',
  '_qdnName',
  '_qdnIdentifier',
  '_qdnPath',
  '_qdnBase',
  '_qdnBaseWithPath',
] as const;

export interface AppIdentity {
  readonly context: HostContextKind;
  /** Raw injected `_qdnContext`, kept for diagnostics when it is unrecognised. */
  readonly rawContext: string;
  readonly service: string;
  /** The publishing (registered) name; `''` when the host did not inject one. */
  readonly name: string;
  readonly identifier: string;
  readonly theme: string;
  readonly lang: string;
  /** The app bridge exists in this document. */
  readonly hasBridge: boolean;
  /** The host can serve host-mediated requests (permission dialogs, signing). */
  readonly interactive: boolean;
  /** `null` unless owner mode is structurally impossible in this context. */
  readonly ownerModeBlockedReason: OwnerModeBlockedReason | null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function defaultGlobalScope(): QdnGlobalScope {
  return globalThis as unknown as QdnGlobalScope;
}

export function readAppIdentity(scope: QdnGlobalScope = defaultGlobalScope()): AppIdentity {
  const rawContext = readString(scope._qdnContext).trim();
  const context: HostContextKind = KNOWN_CONTEXTS.includes(rawContext)
    ? (rawContext as HostContextKind)
    : 'unknown';

  const name = readString(scope._qdnName);
  const service = readString(scope._qdnService);
  const hasBridge = typeof scope.qortalRequest === 'function';
  const interactive = hasBridge && context === 'render';

  let ownerModeBlockedReason: OwnerModeBlockedReason | null = null;
  if (!hasBridge) ownerModeBlockedReason = 'no-bridge';
  else if (!interactive) ownerModeBlockedReason = 'non-interactive-context';
  else if (name.trim() === '') ownerModeBlockedReason = 'empty-publishing-name';

  return {
    context,
    rawContext,
    service,
    name,
    identifier: readString(scope._qdnIdentifier),
    theme: readString(scope._qdnTheme),
    lang: readString(scope._qdnLang),
    hasBridge,
    interactive,
    ownerModeBlockedReason,
  };
}

/** Human-readable diagnostics line; never shown as a public-page control. */
export function describeHostContext(identity: AppIdentity): string {
  const context = identity.rawContext === '' ? 'unknown' : identity.rawContext;
  const name = identity.name === '' ? '(none)' : identity.name;
  return `context=${context} service=${identity.service || '(none)'} publishingName=${name} bridge=${String(
    identity.hasBridge,
  )} interactive=${String(identity.interactive)}`;
}
