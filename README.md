# Qortal Web Builders

Custom websites and custom Qortal apps, designed and built around each project's
visual and functional requirements.

This repository is the clean development rewrite of the published QWB site. It is
a single-entry `WEBSITE` QDN application: Vite + TypeScript + vanilla DOM modules,
no framework runtime, no jQuery, no `qapp-core`.

## Source of truth

The only authoritative source for the latest app code and documentation is
[`iffinland/QWB-Qortal-Web-Builders`, branch `main`](https://github.com/iffinland/QWB-Qortal-Web-Builders/tree/main).

Development does not depend on a particular computer, editor, checkout directory,
external report folder or separate reference copy. All paths in the instructions
are relative to this repository's root. Temporary workspaces and downloaded ZIPs
are snapshots; consult GitHub `main` for the current version. Published website
archives and owner-authored QDN content are separate from the source repository.

| Location  | Purpose                                               |
| --------- | ----------------------------------------------------- |
| `src/`    | app code, styles, bundled assets and seed content     |
| `tests/`  | unit and integration tests                            |
| `e2e/`    | browser workflow tests                                |
| `docs/`   | architecture, asset inventory and licence information |
| `public/` | icons and web manifest copied into the build          |
| `dist/`   | generated publishing output, not committed            |

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

## Related project

[`iffi-vaba-mees-QORTAL`](https://github.com/iffinland/iffi-vaba-mees-QORTAL)
provided a reference for contextual editing and Qortal media URL resolution.
It is not the source of truth for this app. Runtime compatibility should be
checked against the Qortal client/node used for deployment; old reference
revisions are not a current compatibility guarantee.

## Architecture in one screen

```text
index.html            viewport meta, skip link, #app, scroll-to-top button
src/main.ts           boot: load content → resolve hash route → render shell → mount behaviour
src/router.ts         hash routes (#/ , #/works, #/posts, #/post/<slug>) + legacy #section_N
src/content/
  schema.ts           entity envelope, payload validators, identifier policy
  seed.ts             built-in starting content
  repository.ts       content-source boundary, tombstone filter, deterministic ordering
  media.ts            image reference → absolute /arbitrary/... URL
src/styles/           design tokens, theme, editor and component styles
src/ui/               rendering helpers, images, navbar behaviour, skip link, scroll-to-top
src/views/            one module per section/view: render(data) → HTML, plus a mount() hook
tests/                vitest + jsdom
```

Owner controls attach directly to public cards and sections and open a mobile
modal editor; there is no visible central owner-tools bar. The
publishing name is resolved from the Qortal render URL, ownership is checked
fail-closed against the connected account, and every save is revision-checked,
published to QDN and read back before success is reported.

## Current functionality

The owner confirmed the Qortal runtime tests passed on 2026-11-20. The descriptions
below document implemented functionality, not a phased roadmap or a comparison
with an external visual baseline. No separate future roadmap is maintained here.

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

- [`docs/architecture.md`](docs/architecture.md) — current stack, ownership, persistence and media lifecycle
- [`docs/attribution.md`](docs/attribution.md) — current asset inventory, SHA-256 and provenance notes
- [`docs/third-party-licences.md`](docs/third-party-licences.md) — bundled dependency licences and notices
