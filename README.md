# Qortal Web Builders

Custom websites and custom Qortal apps, designed and built around each project's
visual and functional requirements.

This repository is the clean development rewrite of the published QWB site. It is
a single-entry `WEBSITE` QDN application: Vite + TypeScript + vanilla DOM modules,
no framework runtime, no jQuery, no `qapp-core`.

## Repository map

| Role                                           | Location                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| This repository (build target)                 | `/home/iffi/VsCodec-Projects/QWB-Qortal-Web-Builders/qortal-web-builders`               |
| Immutable visual golden master (**read-only**) | `/home/iffi/VsCodec-Projects/QWB-Qortal-Web-Builders/-PUBLISHED-versioon`               |
| GitHub remote                                  | `git@github.com:iffinland/QWB-Qortal-Web-Builders.git`                                  |
| Canonical report root (outside this repo)      | `/home/iffi/VsCodec-Projects/Qortal/qortal-dev-workspace/docs/qwb-qortal-web-builders/` |

The golden master has no Git metadata and is **never** a Git remote, submodule,
worktree or reference directory of this repository. Individual assets were
_copied_ in with a written source mapping ([`docs/attribution.md`](docs/attribution.md));
never build, format or edit inside the golden master itself.

## Commands

```bash
npm install
npm run dev          # Vite dev server
npm run build        # tsc --noEmit && vite build  → dist/
npm run preview      # serve the production build on :4173
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run lint         # eslint .
npm run format       # prettier --write .
```

## Publishing target

- Service `WEBSITE`, publishing identity (and therefore `_qdnName`) **`Qortal Web Builders`**.
- Hash-based routing, because Core's index-fallback routing applies only to `APP`
  resources: every dynamic view lives in the URL hash (`#/works`, `#/posts`,
  `#/post/<slug>`). The legacy `#section_N` anchors still resolve to the home view.
- All runtime asset URLs are relative (`base: './'`), so the build works from any
  QDN resource path.

## Pinned references

Platform behaviour is designed against these revisions. Re-verify before any
platform-dependent change.

| Reference                                              | Revision                                            |
| ------------------------------------------------------ | --------------------------------------------------- |
| Qortal Core `master`                                   | `108bf191d42d710ec617f535af30cfd82fc03c87` (6.1.9)  |
| Qortal Hub `develop`                                   | `12a573b27246e8a626b24794830c6bc432d1b05d`          |
| qapp-core `master`                                     | `0f9d6ac5134ef2f82c1444a74e78471ddc7eb7df` (1.0.79) |
| qapp-templates `main`                                  | `143cc7bffd265f543f96ef25bf1b58ef7bb04472`          |
| Reference app `iffinland/iffi-vaba-mees-QORTAL` `main` | `64f55bf7b6f4a1a093f19413d3a985e61a9fad37`          |

Golden-master integrity is proven by the manifest at
`…/docs/qwb-qortal-web-builders/validation/2026-09-15-qwb-golden-master-sha256.txt`
(manifest digest `18e2a960cc126cb34ab68c432c5a8a1331c980fbb187db38f63d7ad063b95a43`).

## Architecture in one screen

```text
index.html            viewport meta, skip link, #app, scroll-to-top button
src/main.ts           boot: load content → resolve hash route → render shell → mount behaviour
src/router.ts         hash routes (#/ , #/works, #/posts, #/post/<slug>) + legacy #section_N
src/content/
  schema.ts           entity envelope, payload validators, identifier policy
  seed.ts             typed Phase-1 seed content
  repository.ts       content-source boundary, tombstone filter, deterministic ordering
  media.ts            image reference → absolute /arbitrary/... URL
src/qortal/           host boundary: injected globals (context.ts), the single bridge wrapper
                      (bridge.ts), owner recognition (identity.ts), truthful write
                      vocabulary + verification gate (write.ts)
src/owner/            owner layer: session (recognition + re-verification rules), targets
                      (attachment points), controls (inline affordances), bar, shell,
                      flows, fields/forms, drafts, phase gate
src/styles/           tokens.css (verbatim golden-master tokens) · theme.css · components.css
                      · owner.css (owner-mode-only, scoped to `qwb-` classes)
src/ui/               rendering helpers, images, navbar behaviour, skip link, scroll-to-top,
                      owner modal host, owner toasts
src/views/            one module per section/view: render(data) → HTML, plus a mount() hook
tests/                vitest + jsdom
```

The owner layer attaches _after_ each render and only finds its own attachment
points in the finished DOM, so no view knows owner mode exists and no public
markup changed for it. Phase 3 swaps `createSeedSource()` for a QDN-backed content
source and plugs persistence into `src/owner/flows.ts`; neither requires a
structural rewrite. See [`docs/architecture.md`](docs/architecture.md).

## Owner mode (Phase 2)

Owner mode is derived automatically and never persisted:

```text
_qdnName (Core-injected publishing name)
  + GET_USER_ACCOUNT (host permission dialog)
  + GET_ACCOUNT_NAMES
  → case-folded membership test   →  owner | visitor | unavailable | inconclusive
```

- no hardcoded owner name or address, no `names[0]`, fail closed, no `owner=true`
  in any storage;
- re-verified before every privileged action and when the document becomes visible
  again;
- the owner sees the same public site plus a compact owner bar and inline
  `✎ / 🗑 / ↑ / ↓ / + Add …` affordances (expanded ≥768 px, badge + sheet on a
  phone); a visitor's DOM is byte-identical to the Phase 1 baseline.

**Phase 2 ships no QDN write.** Every mutation affordance is DOM-only and says so;
the form's primary action is rendered disabled with the reason, and the enabled
`Validate draft` action runs the real validator and reports that nothing was saved
or published. Owner mode is structurally impossible in the developer-mode proxy
(no injected `_qdnName`) and in gateway/domain-map serving; those contexts report
`unavailable` with the reason instead of guessing.

## Status

| Phase | Scope                                                             | State       |
| ----- | ----------------------------------------------------------------- | ----------- |
| 0     | repository, tooling, structure, reference pins, asset attribution | done        |
| 1     | public visual baseline from typed seed content                    | done        |
| 2     | owner recognition + owner UI shell (no QDN writes)                | done        |
| 3     | QDN-backed CRUD, media, truthful outcomes                         | not started |
| 4     | owner-runtime validation, visual regression, documentation        | not started |

Explicitly **not** in this repository yet: QDN reads or writes, media publishing,
any Add/Edit/Delete persistence, a derived index, migration/import tooling, and
deployment or publication. Owner-mode acceptance still requires an owner run in a
real Qortal host (see the Phase 2 implementation report); no QDN write is
authorized by the existence of this code.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — stack, module boundaries, content model, phase seams
- [`docs/attribution.md`](docs/attribution.md) — per-asset source mapping, SHA-256 and retention decision
- [`docs/third-party-licences.md`](docs/third-party-licences.md) — MIT / SIL OFL notices for bundled dependencies
