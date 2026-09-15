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
src/styles/           tokens.css (verbatim golden-master tokens) · theme.css · components.css
src/ui/               rendering helpers, images, navbar behaviour, skip link, scroll-to-top
src/views/            one module per section/view: render(data) → HTML, plus a mount() hook
tests/                vitest + jsdom
```

Phase 2 owner controls and inline editing attach inside the existing `mount()`
hooks on the same containers; Phase 3 swaps `createSeedSource()` for a QDN-backed
content source. Neither requires a structural rewrite. See
[`docs/architecture.md`](docs/architecture.md).

## Status

| Phase | Scope                                                             | State       |
| ----- | ----------------------------------------------------------------- | ----------- |
| 0     | repository, tooling, structure, reference pins, asset attribution | done        |
| 1     | public visual baseline from typed seed content                    | done        |
| 2     | owner recognition + owner UI shell                                | not started |
| 3     | QDN-backed CRUD, media, truthful outcomes                         | not started |
| 4     | owner-runtime validation, visual regression, documentation        | not started |

Explicitly **not** in this repository yet: owner recognition, owner controls,
add/edit/delete flows, QDN reads or writes, any migration/import tooling, and
deployment or publication. No QDN write is authorized by the existence of this
code.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — stack, module boundaries, content model, phase seams
- [`docs/attribution.md`](docs/attribution.md) — per-asset source mapping, SHA-256 and retention decision
- [`docs/third-party-licences.md`](docs/third-party-licences.md) — MIT / SIL OFL notices for bundled dependencies
