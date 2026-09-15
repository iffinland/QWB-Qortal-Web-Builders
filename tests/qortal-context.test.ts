import { describe, expect, it } from 'vitest';

import type { QdnGlobalScope } from '../src/qortal/context';
import {
  QDN_CONTEXT_GLOBAL_NAMES,
  describeHostContext,
  readAppIdentity,
} from '../src/qortal/context';

const BRIDGE = (): Promise<unknown> => Promise.resolve({});

describe('injected global names', () => {
  // Verified against Core `108bf191`
  // `src/main/java/org/qortal/api/HTMLParser.java#addAdditionalHeaderTags`:
  //   <script>var _qdnContext="…"; var _qdnTheme="…"; var _qdnLang="…";
  //   var _qdnService="…"; var _qdnName="…"; var _qdnIdentifier="…";
  //   var _qdnPath="…"; var _qdnBase="…"; var _qdnBaseWithPath="…";</script>
  // The leading underscore is part of the contract: reading `qdnName` instead of
  // `_qdnName` silently disables owner mode in a real host.
  it('declares exactly the nine globals Core injects, in declaration order', () => {
    expect([...QDN_CONTEXT_GLOBAL_NAMES]).toEqual([
      '_qdnContext',
      '_qdnTheme',
      '_qdnLang',
      '_qdnService',
      '_qdnName',
      '_qdnIdentifier',
      '_qdnPath',
      '_qdnBase',
      '_qdnBaseWithPath',
    ]);
  });

  it('ignores underscore-less lookalike globals', () => {
    // Deliberately the wrong (underscore-less) shape, as a host would not inject it.
    const lookalike = {
      qdnContext: 'render',
      qdnService: 'WEBSITE',
      qdnName: 'Qortal Web Builders',
      qortalRequest: BRIDGE,
    } as unknown as QdnGlobalScope;

    const identity = readAppIdentity(lookalike);

    expect(identity.name).toBe('');
    expect(identity.context).toBe('unknown');
    expect(identity.interactive).toBe(false);
    expect(identity.ownerModeBlockedReason).toBe('non-interactive-context');
  });
});

describe('host context', () => {
  it('reads the injected rendering context, service and publishing name', () => {
    const identity = readAppIdentity({
      _qdnContext: 'render',
      _qdnService: 'WEBSITE',
      _qdnName: 'Qortal Web Builders',
      _qdnIdentifier: 'default',
      _qdnTheme: 'light',
      _qdnLang: 'en',
      qortalRequest: BRIDGE,
    });

    expect(identity.context).toBe('render');
    expect(identity.service).toBe('WEBSITE');
    expect(identity.name).toBe('Qortal Web Builders');
    expect(identity.hasBridge).toBe(true);
    expect(identity.interactive).toBe(true);
    expect(identity.ownerModeBlockedReason).toBeNull();
    expect(describeHostContext(identity)).toContain('publishingName=Qortal Web Builders');
  });

  it.each(['proxy', 'gateway', 'domainMap'])(
    'treats the %s context as non-interactive',
    (context) => {
      const identity = readAppIdentity({
        _qdnContext: context,
        _qdnService: 'WEBSITE',
        _qdnName: context === 'proxy' ? '' : 'Qortal Web Builders',
        qortalRequest: BRIDGE,
      });

      expect(identity.context).toBe(context);
      expect(identity.interactive).toBe(false);
      expect(identity.ownerModeBlockedReason).toBe('non-interactive-context');
    },
  );

  it('blocks owner mode without a bridge even in the render context', () => {
    const identity = readAppIdentity({ _qdnContext: 'render', _qdnName: 'Qortal Web Builders' });

    expect(identity.hasBridge).toBe(false);
    expect(identity.ownerModeBlockedReason).toBe('no-bridge');
  });

  it('blocks owner mode when the host injected no publishing name', () => {
    const identity = readAppIdentity({
      _qdnContext: 'render',
      _qdnName: '',
      qortalRequest: BRIDGE,
    });

    expect(identity.ownerModeBlockedReason).toBe('empty-publishing-name');
  });

  it('reports an unrecognised context as unknown and non-interactive', () => {
    const identity = readAppIdentity({
      _qdnContext: 'something-new',
      _qdnName: 'Qortal Web Builders',
      qortalRequest: BRIDGE,
    });

    expect(identity.context).toBe('unknown');
    expect(identity.rawContext).toBe('something-new');
    expect(identity.interactive).toBe(false);
  });

  it('ignores non-string injected values instead of trusting them', () => {
    const identity = readAppIdentity({
      _qdnContext: 42,
      _qdnName: { name: 'Qortal Web Builders' },
      qortalRequest: 'yes',
    });

    expect(identity.context).toBe('unknown');
    expect(identity.name).toBe('');
    expect(identity.hasBridge).toBe(false);
  });
});
