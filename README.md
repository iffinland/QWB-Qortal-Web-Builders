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
npm run test:browser # local Chromium editor workflow with a simulated Qortal bridge
npm run lint         # eslint .
npm run format       # prettier --write .
```

## Publishing target

- Service `WEBSITE`. The QWB deployment uses **`Qortal Web Builders`**, but the
  same archive can be published under any registered name. Ownership, content
  reads/writes and Q-Mail recipients follow the name in the render URL.
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

Owner controls attach directly to public cards and sections and open a mobile
modal editor; there is no visible central owner-tools bar. The
publishing name is resolved from the Qortal render URL, ownership is checked
fail-closed against the connected account, and every save is revision-checked,
published to QDN and read back before success is reported.

## Status

| Phase | Scope                                                             | State       |
| ----- | ----------------------------------------------------------------- | ----------- |
| 0     | repository, tooling, structure, reference pins, asset attribution | done        |
| 1     | public visual baseline from typed seed content                    | done        |
| 2     | owner recognition + owner UI shell                                | done        |
| 3     | QDN-backed CRUD, media references, truthful outcomes              | done (beta) |
| 4     | owner-runtime validation and documentation                       | runtime passed by owner, 2026-11-20; formal visual regression pending |

The owner can edit site identity and assets, navigation, section visibility and
headings, contact/footer/meta copy, services, steps, projects, pricing, articles,
and all labels used by the public sub-pages. Collection items can be added,
edited, hidden or tombstoned through contextual controls. Hidden items can be
restored from the owner's hidden-content list. Section/footer visibility is
reversible. Image and video fields accept files
from the owner's device; media is published to QDN before the JSON entity that
references it. Deployment of the app archive itself remains outside this
repository. No QDN write occurs unless the verified owner explicitly saves.

Rich-text fields support bold, italic, underline, headings, lists, links and
undo/redo. DOMPurify sanitizes formatting before rendering. Navigation, contact
rows, buttons and lists use separate labeled controls instead of technical text
formats. Media previews support individual removal, clearing and restoring the
original selection. Selecting a new gallery replaces the current gallery.

## Build and publish

```bash
npm ci
npm run build
cd dist
zip -r ../qwb-publish.zip .
```

Publish the ZIP as `WEBSITE` under the intended registered name. `index.html` and
`assets/` must be at the archive root, without a wrapping `dist/` directory. App
updates do not erase separately published content. Outside a recognized Qortal
render URL the app shows built-in content and disables owner tools.

Images (up to 10 MiB each) and videos (up to 200 MiB) are copied into memory as
soon as selected, before Android's temporary file permission can expire. Media
is published as a raw `IMAGE`/`VIDEO` resource. The device filename is metadata,
not a URL suffix. Playback/display resolves the node URL through
`GET_QDN_RESOURCE_URL`, with bounded build/load retries and an absolute raw URL
fallback. Previously saved filename-bearing references remain compatible.

## Validation

The latest automated run passed 120 Vitest tests, TypeScript, ESLint and the
production build. The owner confirmed real Qortal runtime tests passed on
2026-11-20 after the published-media URL correction. That runtime confirmation
is user-reported; automated browser tests use a simulated bridge/resource server.

For the browser workflow, install Chromium (or Playwright Chromium) and FFmpeg.
Start `npm run dev -- --host 127.0.0.1` in another terminal, then run
`npm run test:browser`. It tests selection, byte-preserving uploads, public image
loading/video playback, reloads, media removal, rich text, save failure/retry and
mobile/desktop modals. `CHROMIUM_PATH` selects a system browser; `QWB_TEST_URL`
overrides the default `http://127.0.0.1:5173`. Otherwise the test uses system
Chromium when available, or a Playwright-installed browser (`npx playwright
install chromium`). Screenshots go to ignored `test-results/`.
See [`docs/architecture.md`](docs/architecture.md) for
persistence and lifecycle details.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — stack, module boundaries, content model, phase seams
- [`docs/attribution.md`](docs/attribution.md) — per-asset source mapping, SHA-256 and retention decision
- [`docs/third-party-licences.md`](docs/third-party-licences.md) — MIT / SIL OFL notices for bundled dependencies
