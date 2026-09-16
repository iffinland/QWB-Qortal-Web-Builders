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
                 ├── src/content/*      content: schema, seed, repository, qdn-source,
                 │                      ordering, media
                 ├── src/router.ts      hash → Route
                 ├── src/views/*        nav + view + footer → HTML string (+ mount hook)
                 ├── src/ui/*           escape/render helpers, images, navbar, skip link,
                 │                      scroll-to-top, owner modal host, owner toasts
                 ├── src/qortal/*       host boundary: injected globals, bridge, owner identity,
                 │                      QDN read path, publish + read-back, base64, truthful
                 │                      write-result vocabulary
                 ├── src/owner/*        owner layer: session, targets, controls, shell, flows,
                 │                      forms/fields, drafts, writes, media, phase gate
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
- **Content access is behind `ContentSource`.** Views never import `seed.ts` or
  `qdn-source.ts`; they receive a validated `ContentLoadResult`. Phase 3 replaced
  the seed source by the QDN source and no view changed.
- **QDN transport lives in `src/qortal/`.** `read.ts` (search/fetch/status),
  `publish.ts` (request building, publish, read-back verification) and `base64.ts`
  are the only modules that name a bridge action or call `qortalRequest`; asserted
  by `tests/support/claims.ts`.
- **Escaping happens in `src/ui/html.ts`.** Views build strings; every
  content-derived value passes through `escapeHtml`/`renderInline`. Owner-authored
  text is never injected as HTML. Phase 3 layered sanitised rich text goes on top
  of this renderer, not instead of it.
- **Links are scheme-checked.** Only `#…` (in-app route) and `qortal://…` become
  anchors. External `https://` links are deliberately not reproduced: Core's
  `q-apps.js` intercepts and blocks them inside a Qortal host, so they were dead
  in the published site.

## 3. Owner layer (Phase 2) and persistence (Phase 3)

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
- Every mutation affordance is wired to a real QDN write (Phase 3); the dirty
  count in the form is tracked separately from the write log, so "unsaved draft"
  never implies "not published".
- Modals are `role="dialog"` + `aria-modal`, trap focus, restore it on close, ask
  before discarding a dirty form, and lock background scroll.

### 3.3 What the owner layer never does

No derived index, no persistence of owner state (nothing touches
`localStorage`/`sessionStorage`/IndexedDB), no physical QDN delete through
node-admin APIs, and no migration tooling. `src/owner/phase.ts` holds the gate
(`QDN_WRITE_ENABLED`); the form's primary action publishes, and every surface
states whether the result is submitted, verified, rejected or unresolved.

`src/qortal/write.ts` keeps "the host accepted a submission" distinct from "the
resource is served": a write is classified `submitted | rejected | ambiguous |
failed`, and the availability (`verified | superseded | not-yet-served |
unverified`) is a _separate_ fact that only a successful read-back can set. The
state label never folds in availability — doing so produced the contradiction
"…availability not yet verified (verified)". `tests/support/claims.ts` scans the
shipped source for bridge action names or direct `qortalRequest` use outside
`src/qortal/` and for persistence APIs, so no UI module can grow its own transport.

### 3.4 Persistence contract (Phase 3)

**Read.** The site singleton is one exact read of `qwb_site_v1` in `JSON`; every
other kind is one bounded `SEARCH_QDN_RESOURCES` in that kind's own service
(`identifier` = kind prefix, `prefix: true`, `mode: 'ALL'` — the node default
`LATEST` keeps only one row per `(name, service)`, `names: [name]` +
`exactMatchNames: true`, `includeStatus`, `excludeBlocked`), paged ≤ 3 × 50 with
`reverse: true`, then hydrated at concurrency 4. Every summary is re-filtered on
**exact** name, service and identifier prefix before it is trusted, because the
node's filters are a convenience and not the authority. Payloads pass the same
validator the seed path uses.

`status: 'ready' | 'partial' | 'error'` is the read result; diagnostics name every
item that was found but could not be used. Seed fallback is narrow by design: (1)
no publishing identity or no bridge, (2) nothing published under the name at all,
(3) the site singleton alone unreadable (seed shell + diagnostic), and (4) the
**pre-publication bootstrap baseline** — per entity, and only for a kind whose
discovery answered without hitting the page budget, a kind keeps the shipped items
that discovery did not report at all. That is what makes the approved "replace the
shipped site one entity at a time" flow safe: an untouched shipped item — and with
it the only control that could ever publish it — never disappears because of
someone else's first write. A reported identifier (active, tombstoned, invalid or
unreadable) is never replaced by its shipped default, and the baseline ends by
itself once every shipped identifier has been published or tombstoned. The seed is
never substituted for entities that exist and failed to load.

**Write.** Publishing identity is the injected `_qdnName`; the coordinate is
`(name, service, identifier)` and Core keeps the newest transaction for it, with no
compare-and-swap:

| Action           | What is published                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add / Edit       | the entity with `rev + 1` (same identifier)                                                                                                                      |
| Reorder          | only the moved entity, with a sparse midpoint `order` (`ordering.ts`); a renumber in `ORDER_GAP` steps is the fallback and reports how many items it republished |
| Delete           | a `state: 'deleted'` tombstone for the same identifier — the previous bytes stay retrievable                                                                     |
| Replace an image | the image first (`THUMBNAIL`/`IMAGE`, same identifier as the entity), verified, then the entity                                                                  |

Verification is a re-read of the same coordinate with the served `rev` compared
against the submitted one (4 attempts × 5 s, terminal on verified/superseded).
Media under `MEDIA_BYTE_COMPARE_LIMIT` decoded bytes is verified by byte identity;
above it the node's `GET_QDN_RESOURCE_STATUS` is used, and the wording says that
byte identity was not compared.

**Interlocks.** One in-flight write per identifier (`owner/writes.ts`); no
automatic retry of any ambiguous or unverified write; drafts live in the open form
and survive rejected, failed and ambiguous writes; every flow re-derives owner mode
immediately before a write and re-checks the lock after that await.

**Service per kind.** `JSON` for `site`, `highlight`, `service`, `step`, `work` and
`price` (≤ 25 KB, node-validated JSON); `DOCUMENT` for `article` (no node-side
limit; this app bounds the payload at `DOCUMENT_MAX_BYTES` because every visitor
read of the kind fetches the payload). The service is a function of the kind and the
kind is encoded in the identifier prefix (`serviceForKind` / `serviceForIdentifier`
in `schema.ts`), so a read-back can never address a different service than the write
used.

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

| Kind        | Service               | Identifier                                                     | Singleton |
| ----------- | --------------------- | -------------------------------------------------------------- | --------- |
| `site`      | `JSON`                | `qwb_site_v1` (fixed)                                          | yes       |
| `highlight` | `JSON`                | `qwb_hl_*`                                                     | no        |
| `service`   | `JSON`                | `qwb_svc_*`                                                    | no        |
| `step`      | `JSON`                | `qwb_step_*`                                                   | no        |
| `work`      | `JSON`                | `qwb_work_*`                                                   | no        |
| `price`     | `JSON`                | `qwb_price_*`                                                  | no        |
| `article`   | `DOCUMENT`            | `qwb_post_*`                                                   | no        |
| media       | `THUMBNAIL` / `IMAGE` | owning entity's identifier (v1 publishes one image per entity) | —         |

**Identifier policy.** Lowercase `[a-z0-9_-]`, max 60 characters, kind-prefixed,
timestamp-suffixed, and **never reused** — an identifier is the entity's permanent
identity, Core has no rename, and re-publishing under a new identifier orphans the
old bytes. Enforced by `isValidIdentifier()` and asserted in `tests/schema.test.ts`.
The add flow mints one identifier per opened form, re-uses it for every submit of
that form, and re-mints if the candidate already exists in the loaded content.

**Service per kind.** The service is a function of the kind (`serviceForKind`) and
is recoverable from the identifier prefix (`serviceForIdentifier`), so discovery,
publish and read-back cannot disagree about where an entity lives.

**Deletion is logical.** There is no app-accessible QDN delete, so a delete is a
republished `state: 'deleted'` with `deletedAt` set. `activeEntities()` filters
tombstones on every read path (`repository.ts`), which is why the filter exists in
Phase 1 even though nothing writes yet.

**Ordering** is deterministic (sparse `order`, then `createdAt`, then `id`) and
persistent: `ordering.ts` plans one midpoint write per move and falls back to a gap
renumber (`ORDER_GAP`) when the gap is no longer representable.

**Media references** are explicit (`bundled` / `qdn` / `placeholder`) and resolved
to a URL only at render time. QDN media is requested through an **absolute**
`/arbitrary/<service>/<name>/<identifier>` path — a relative path would resolve
against the frame's `<base href>` and return the app shell HTML instead of the
image. Publishing order is always media → entity.

**Seed content** (`src/content/seed.ts`) is typed content: the published structure
with the repositioned message, the owner's real published portfolio list and price
points, and `placeholder` covers. From Phase 3 it is the read fallback (see §3.4)
and the design reference the QDN read path is compared against. From the Phase 4
checkpoint it is also the per-entity bootstrap baseline (§3.4), because the
approved flow is that the owner replaces the shipped content _one entity at a
time_: an item discovery did not report keeps rendering from the seed until the
owner publishes or deletes it. There is no import of the old markup, and no
migration script exists by design.

**Article bodies are structured blocks**, not HTML: headings, paragraphs, lists,
quotes, images and links are modelled as data and rendered through the same
escaping helpers as everything else. The audit's §6.1 field list said "sanitised
HTML"; storing blocks means the sanitising step does not exist, and a stored
payload can never introduce markup.

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
| 3 — QDN-backed CRUD + media            | **done (code)**: QDN-backed `ContentSource`, publish/verify writes with `rev` comparison, media pipeline, tombstones, persistent ordering                                                      | the view modules — they only ever see `ContentLoadResult`                     |
| 4 — owner-runtime validation           | owner publishes real content in a real host; contrast/accessibility pass; visual regression against the Phase 1 baseline                                                                       | the Phase 1 visual baseline (regressions are recorded, not silently absorbed) |

Deferred by default (not in Phases 0–4): a derived index, rich text beyond
sanitised basics, comments, visitor accounts, i18n, offline caching, and any admin
dashboard.

## 8. Deliberate non-goals in this repository

A derived index; migration/import tooling; deployment or publication; a physical
QDN delete (there is no app-accessible one); automatic retries of ambiguous writes;
republishing the `WEBSITE` resource itself; skills promotion before owner-runtime
evidence. Phase 3 ships the read/write code but has **not** been exercised against
a live node — that is the Phase 4 staging run, and no runtime PASS may be claimed
before it.
