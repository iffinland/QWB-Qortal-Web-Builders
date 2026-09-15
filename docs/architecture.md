# QWB architecture

Owner-approved architecture. This document records the decisions this repository
implements; it does not replace the audit, which remains the evidence trail.

Source audit:
`/home/iffi/VsCodec-Projects/Qortal/qortal-dev-workspace/docs/qwb-qortal-web-builders/audits/2026-09-15-qwb-target-architecture-proposal.md`

## 1. Stack

Vite + TypeScript + vanilla DOM component modules, published as a single-entry
`WEBSITE` QDN resource under the identity `Qortal Web Builders`.

Rejected: React + MUI (would import a design system that fights the preserved
visual identity and adds ~45–55 KB gzip before app code); `qapp-core` runtime (a
React + MUI library); jQuery and the Bootstrap JS bundle (the published site's
jQuery/plugin layer is removed and its behaviour reimplemented natively).

Bootstrap 5.2.2 is kept as CSS only — it is the grid substrate the theme was
written against, and keeping it is what makes the visual descent checkable.

| Concern        | Decision                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Routing        | Hash-based. Core's index-fallback routing applies only to `APP` resources, so `WEBSITE` must keep dynamic views in the hash. |
| Build base     | `base: './'` — every emitted asset URL is relative, so the archive works from any QDN resource path.                         |
| CSS            | `cssCodeSplit: false` — one stylesheet; the app is small and a single request is better than waterfall.                      |
| Asset inlining | `assetsInlineLimit: 4096` — brand/structural assets stay in the archive, content images are QDN-managed.                     |
| Tests          | `vitest` + `jsdom`.                                                                                                          |

## 2. Module boundaries

```text
index.html ──> src/main.ts
                 ├── src/content/*      content: schema, seed, repository, media
                 ├── src/router.ts      hash → Route
                 ├── src/views/*        nav + view + footer → HTML string (+ mount hook)
                 ├── src/ui/*           escape/render helpers, images, navbar, skip link, scroll-to-top
                 └── src/styles/*       tokens → theme → components
```

Rules that keep the layers separable:

- **Views are pure renderers.** A view exposes `{ title, description, html, mount? }`.
  It never touches `document.title`, never wires global listeners, and never
  fetches content. `main.ts` owns the shell and the lifecycle.
- **`mount(root, context)` is the only place behaviour attaches.** Phase 2 owner
  controls and inline editors attach on the same containers through these hooks,
  which is why no structural rewrite is needed later.
- **Content access is behind `ContentSource`.** Views never import `seed.ts`;
  they receive a validated `ContentBundle`. Phase 3 replaces
  `createSeedSource()` with a QDN-backed source and nothing else changes.
- **Escaping happens in `src/ui/html.ts`.** Views build strings; every
  content-derived value passes through `escapeHtml`/`renderInline`. Owner-authored
  text is never injected as HTML. Phase 3 layered sanitised rich text goes on top
  of this renderer, not instead of it.
- **Links are scheme-checked.** Only `#…` (in-app route) and `qortal://…` become
  anchors. External `https://` links are deliberately not reproduced: Core's
  `q-apps.js` intercepts and blocks them inside a Qortal host, so they were dead
  in the published site.

## 3. Routes

| Hash                        | View                                                      |
| --------------------------- | --------------------------------------------------------- |
| `#/` or empty               | home                                                      |
| `#section_1` … `#section_5` | home, scrolled to that section (legacy published anchors) |
| `#/works`                   | completed works                                           |
| `#/posts`                   | article index                                             |
| `#/post/<slug>`             | article detail                                            |
| anything else               | not-found view                                            |

`#main-content` is **reserved** as a focus target, not a route: it is the skip
link's target, and letting it reach the router would replace the page. See
`src/ui/skip-link.ts` and `RESERVED_FOCUS_HASHES`.

`routeKey()` gives a route its stable identity excluding the in-page anchor, so a
hash change within the same view scrolls instead of re-rendering.

## 4. Content model

One entity per editable thing, one QDN resource per entity, published under the
app's own name. The common envelope:

```jsonc
{
  "schema": 1, // payload format version; unknown versions are rejected, never rendered
  "id": "qwb_work_asot-...", // = the QDN identifier, duplicated inside the payload
  "kind": "work",
  "rev": 3, // monotonic; the write-verification handle
  "state": "active", // "active" | "deleted"
  "createdAt": 0,
  "updatedAt": 0,
  "deletedAt": null,
  "order": 20, // sparse (10, 20, 30 …): a reorder republishes one entity
  "title": "…",
  "payload": {/* kind-specific */},
}
```

Kinds and identifier prefixes:

| Kind        | Service               | Identifier                                         | Singleton |
| ----------- | --------------------- | -------------------------------------------------- | --------- |
| `site`      | `JSON`                | `qwb_site_v1` (fixed)                              | yes       |
| `highlight` | `JSON`                | `qwb_hl_*`                                         | no        |
| `service`   | `JSON`                | `qwb_svc_*`                                        | no        |
| `step`      | `JSON`                | `qwb_step_*`                                       | no        |
| `work`      | `JSON`                | `qwb_work_*`                                       | no        |
| `price`     | `JSON`                | `qwb_price_*`                                      | no        |
| `article`   | `DOCUMENT`            | `qwb_post_*`                                       | no        |
| media       | `THUMBNAIL` / `IMAGE` | owning entity's identifier (`<id>_<n>` for extras) | —         |

**Identifier policy.** Lowercase `[a-z0-9_-]`, max 60 characters, kind-prefixed,
timestamp-suffixed, and **never reused** — an identifier is the entity's permanent
identity, Core has no rename, and re-publishing under a new identifier orphans the
old bytes. Enforced by `isValidIdentifier()` and asserted in `tests/schema.test.ts`.

**Deletion is logical.** There is no app-accessible QDN delete, so a delete is a
republished `state: 'deleted'` with `deletedAt` set. `activeEntities()` filters
tombstones on every read path (`repository.ts`), which is why the filter exists in
Phase 1 even though nothing writes yet.

**Ordering** is deterministic: sparse `order`, then `createdAt`, then `id`.

**Media references** are explicit (`bundled` / `qdn` / `placeholder`) and resolved
to a URL only at render time. QDN media is requested through an **absolute**
`/arbitrary/<service>/<name>/<identifier>` path — a relative path would resolve
against the frame's `<base href>` and return the app shell HTML instead of the
image. Publishing order is always media → entity.

**Seed content** (`src/content/seed.ts`) is typed mock content: the published
structure with the repositioned message, the owner's real published portfolio list
and price points, and `placeholder` covers. There is no import or migration of the
old markup, and no migration script exists by design.

## 5. Style layers

```text
tokens.css      design tokens, verbatim from the golden master :root
                (+ --secondary-text-color: a legible aquamarine for text)
theme.css       the published component vocabulary, identical class names
components.css  pieces the published site did with inline <style> or not at all
fonts.css       self-hosted @font-face (latin subset, woff2 only)
```

`theme.css` keeps the golden master's class names so "did the design survive?" is
answerable by inspection and by screenshot diff. Removed from the published CSS:
dead template components (timeline, FAQ, newsletter, subscribe form, pagination,
dropdowns, social icons, unused topic-listing variants) and the unparsable SCSS
tail whose global `p{}` rule capitalised and shrank every paragraph.

## 6. Phase seams

| Phase                                  | What changes                                                                                                                              | What must not change                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 2 — owner recognition + owner UI shell | new `src/qortal/` modules (context, bridge, identity); owner controls added inside existing `mount()` hooks; modal/toast/confirm plumbing | the `View` interface, the content schema, the rendered public HTML            |
| 3 — QDN-backed CRUD + media            | `createSeedSource()` is replaced by a QDN-backed `ContentSource`; writes with `rev` verification; media publish pipeline                  | the view modules — they only ever see `ContentLoadResult`                     |
| 4 — owner-runtime validation           | owner publishes real content in a real host; contrast/accessibility pass; visual regression against the Phase 1 baseline                  | the Phase 1 visual baseline (regressions are recorded, not silently absorbed) |

Deferred by default (not in Phases 0–4): a derived index, rich text beyond
sanitised basics, comments, visitor accounts, i18n, offline caching, and any admin
dashboard.

## 7. Deliberate non-goals in this repository

Owner recognition and owner controls; add/edit/delete flows; QDN reads or writes;
migration/import tooling; deployment or publication; skills promotion. No QDN write
is authorized by the presence of this code.
