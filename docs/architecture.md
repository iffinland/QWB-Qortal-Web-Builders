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
                 ├── src/ui/*           escape/render helpers, images, navbar, skip link,
                 │                      scroll-to-top, owner modal host, owner toasts
                 ├── src/qortal/*       host boundary: injected globals, bridge, owner identity,
                 │                      truthful write-result vocabulary
                 ├── src/owner/*        owner layer: session, targets, controls, shell, flows,
                 │                      forms/fields, drafts, phase gate
                 └── src/styles/*       tokens → theme → components → owner
```

Rules that keep the layers separable:

- **Views are pure renderers.** A view exposes `{ title, description, html, mount? }`.
  It never touches `document.title`, never wires global listeners, and never
  fetches content. `main.ts` owns the shell and the lifecycle.
- **`mount(root, context)` is the only place public behaviour attaches.** The
  owner layer attaches _after_ the shell renders and only finds its own attachment
  points in the finished DOM (`src/owner/targets.ts`), so no view knows owner mode
  exists and no view had to change for it.
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

## 3. Owner layer (Phase 2)

The owner layer is additive: it renders **into** the public DOM, never through it.
A visitor's markup is produced by exactly the Phase 1 render path and then nothing
else is appended, which `tests/phase-2-visitor-baseline.test.ts` asserts by
comparing the live `#app` markup against the Phase 1 render output byte-for-byte
for five non-owner contexts and five routes.

### 3.1 Owner recognition contract

```text
_qdnName                        the app's publishing (registered) name, injected by Core
  + GET_USER_ACCOUNT            the current account (host permission dialog)
  + GET_ACCOUNT_NAMES           the names that account owns
  → case-folded membership test
  → owner | visitor | unavailable | inconclusive
```

| Rule                         | How it is enforced                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| Automatic                    | One boot derivation; there is no login, no owner picker, and no "logged in as" surface.                  |
| No hardcoded owner identity  | Neither the owner's name nor address appears in `src/`.                                                  |
| Never `names[0]`             | Membership is a case-folded set test over the whole list; response order is never read.                  |
| Fail closed                  | Every failure path ends in a non-owner status; only `owner` renders owner UI.                            |
| No persisted authority       | Nothing is written to `localStorage`/`sessionStorage`/IndexedDB — asserted by `tests/support/claims.ts`. |
| Re-verified before privilege | `session.assertOwner()` runs before every flow opens or acts (`trigger: 'action'`).                      |
| Re-verified on visibility    | A `visibilitychange` to `visible` re-derives the decision (an account switch is otherwise unobservable). |
| Non-interactive hosts honest | Gateway/domain-map contexts and the dev proxy report `unavailable` with the reason, never a guess.       |

`unavailable` (structurally impossible: no bridge, read-only context, or no
injected publishing name) and `inconclusive` (attempt failed: declined dialog,
timeout, unreadable payload) are deliberately distinct from `visitor`; both refuse
privileged actions, and only `inconclusive` is re-attempted automatically.

### 3.2 What the owner sees

The same public site, plus a compact fixed owner bar (badge + publishing name +
publishing status + unsaved-change count + `Publishing status` / `Re-check owner
mode`), plus inline affordances attached to the containers the views already emit:
`✎ edit`, `🗑 delete`, `↑`/`↓` reorder, and a `+ Add …` row per section.

- The bar is expanded where there is room (`≥768 px`) and collapses to its badge
  on a phone, where the toggle opens the same information as a sheet.
- `src/owner/targets.ts` maps every editable entity to a selector **and an index**,
  and `controls.ts` compares the DOM count against the expected entity count per
  group: on a mismatch the group gets **no** controls and one diagnostic instead of
  a control attached to the wrong entity.
- Owner mutations are DOM-only in this phase and are labelled as such everywhere;
  the change count is tracked so the dirty/discard contract exists before writes do.
- Modals are `role="dialog"` + `aria-modal`, trap focus, restore it on close, ask
  before discarding a dirty form, and lock background scroll.

### 3.3 What Phase 2 never does

No QDN publish/update/delete, no media publishing, no derived index, no
persistence of owner state. `src/owner/phase.ts` holds the gate
(`QDN_WRITE_ENABLED === false`); the primary form action is rendered **disabled**
with the reason next to it, and the only enabled action is `Validate draft`, which
runs the real draft assembly and the read path's validator and then says explicitly
that nothing was saved or published.

`src/qortal/write.ts` still exists, because the classifier had to be designed
before any write path exists: it keeps "the host accepted a submission" distinct
from "the resource is served" (`submitted | rejected | ambiguous | failed`, with
availability always `unverified` in this phase) and holds the tombstone wording a
delete must use. `tests/support/claims.ts` scans the shipped source for
write-capable bridge actions outside the transport modules and for persistence
APIs, so a Phase-2 UI cannot quietly gain the vocabulary of a save.

## 4. Routes

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

## 5. Content model

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

## 6. Style layers

```text
tokens.css      design tokens, verbatim from the golden master :root
                (+ --secondary-text-color: a legible aquamarine for text)
theme.css       the published component vocabulary, identical class names
components.css  pieces the published site did with inline <style> or not at all
fonts.css       self-hosted @font-face (latin subset, woff2 only)
owner.css       owner-mode-only layer: every rule is scoped to a `qwb-` owner class,
                reuses the same tokens, and changes no public component geometry
```

`theme.css` keeps the golden master's class names so "did the design survive?" is
answerable by inspection and by screenshot diff. Removed from the published CSS:
dead template components (timeline, FAQ, newsletter, subscribe form, pagination,
dropdowns, social icons, unused topic-listing variants) and the unparsable SCSS
tail whose global `p{}` rule capitalised and shrank every paragraph.

## 7. Phase seams

| Phase                                  | What changes                                                                                                                                                                                   | What must not change                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 2 — owner recognition + owner UI shell | **done**: new `src/qortal/` modules (context, bridge, identity, write vocabulary) and `src/owner/` (session, targets, controls, bar, shell, flows, fields/forms, drafts); modal/toast plumbing | the `View` interface, the content schema, the rendered public HTML            |
| 3 — QDN-backed CRUD + media            | `createSeedSource()` is replaced by a QDN-backed `ContentSource`; writes with `rev` verification; media publish pipeline                                                                       | the view modules — they only ever see `ContentLoadResult`                     |
| 4 — owner-runtime validation           | owner publishes real content in a real host; contrast/accessibility pass; visual regression against the Phase 1 baseline                                                                       | the Phase 1 visual baseline (regressions are recorded, not silently absorbed) |

Deferred by default (not in Phases 0–4): a derived index, rich text beyond
sanitised basics, comments, visitor accounts, i18n, offline caching, and any admin
dashboard.

## 8. Deliberate non-goals in this repository

QDN reads or writes; media publishing; any real Add/Edit/Delete persistence; a
derived index; migration/import tooling; deployment or publication; skills
promotion. Phase 2 ships the owner **shell** only: the forms, validators and
identifiers a write would need exist and are exercised, but no code path can
publish. No QDN write is authorized by the presence of this code.
