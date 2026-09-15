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
  schema.ts           entity envelope, payload validators, identifier + service policy
  seed.ts             typed Phase-1 seed content (design reference + read fallback)
  repository.ts       content-source boundary, tombstone filter, deterministic ordering
  qdn-source.ts       the QDN-backed source: bounded prefix discovery + hydration
  ordering.ts         sparse-order reorder planning (one midpoint write per move)
  media.ts            image reference → absolute /arbitrary/... URL
src/qortal/           host boundary: injected globals (context.ts), the single bridge wrapper
                      (bridge.ts), owner recognition (identity.ts), QDN read path (read.ts),
                      publish + read-back verification (publish.ts), base64 (base64.ts),
                      truthful write vocabulary (write.ts)
src/owner/            owner layer: session (recognition + re-verification rules), targets
                      (attachment points), controls (inline affordances), bar, shell,
                      flows, fields/forms, drafts, writes (in-flight log), media
                      (encode/downscale), phase gate
src/styles/           tokens.css (verbatim golden-master tokens) · theme.css · components.css
                      · owner.css (owner-mode-only, scoped to `qwb-` classes)
src/ui/               rendering helpers, images, navbar behaviour, skip link, scroll-to-top,
                      owner modal host, owner toasts
src/views/            one module per section/view: render(data) → HTML, plus a mount() hook
tests/                vitest + jsdom
```

The owner layer attaches _after_ each render and only finds its own attachment
points in the finished DOM, so no view knows owner mode exists and no public
markup changed for it. Phase 3 replaced `createSeedSource()` with the QDN-backed
source and plugged persistence into `src/owner/flows.ts`; neither needed a
structural change. See [`docs/architecture.md`](docs/architecture.md).

## Owner mode and content persistence (Phases 2–3)

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

Owner mode is structurally impossible in the developer-mode proxy (no injected
`_qdnName`) and in gateway/domain-map serving; those contexts report `unavailable`
with the reason instead of guessing.

### Read contract (Phase 3)

```text
site singleton      FETCH_QDN_RESOURCE  /arbitrary/JSON/<name>/qwb_site_v1   (exact)
every other kind    SEARCH_QDN_RESOURCES service = kind's own service,
                      identifier = kind prefix, prefix: true, mode: 'ALL',
                      names: [<name>], exactMatchNames: true, includeStatus
  → re-filter every summary on exact name + service + identifier prefix
  → FETCH_QDN_RESOURCE per summary, bounded concurrency (4), ≤ 3 pages × 50
  → validate with the same validator the seed uses; tombstones are filtered
```

Kinds are `site` (fixed `qwb_site_v1`), `highlight` (`qwb_hl_`), `service`
(`qwb_svc_`), `step` (`qwb_step_`), `work` (`qwb_work_`), `price` (`qwb_price_`)
and `article` (`qwb_post_`, service `DOCUMENT`; every other kind is `JSON`).

The seed renders only when the app cannot address QDN at all (no `_qdnName`/no
bridge), when nothing is published under the name at all, or when the site
singleton alone is unreadable. It is never substituted for entities that exist but
failed to load — that is reported as `partial` with diagnostics, and a total read
failure shows the content-error state.

### Write contract (Phase 3)

```text
Add / Edit      publish the entity        (name, service, identifier) with rev + 1
Edit an image   publish the image first   THUMBNAIL ≤ 500 KB or IMAGE ≤ 10 MB, then the entity
Reorder         publish the moved entity only (sparse midpoint; renumber is the fallback)
Delete          publish a tombstone       same coordinate, state: "deleted", rev + 1
Verify          re-read the resource and compare the served rev (4 attempts × 5 s)
```

- every request carries `name` (the injected `_qdnName`); the host decides ownership;
- one in-flight write per identifier, no automatic retry, media before entity;
- nothing is reported as published until the read-back proves the revision;
- the outcome vocabulary is `submitted | rejected | ambiguous | failed` plus an
  availability (`verified | superseded | not-yet-served | unverified`) — a
  submission is never presented as a result, and a failed or ambiguous write keeps
  the draft in the open form.

Owner-mode acceptance still requires an owner run in a real Qortal host: no write
has been exercised against a live node from this repository.

## Status

| Phase | Scope                                                             | State                                                 |
| ----- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| 0     | repository, tooling, structure, reference pins, asset attribution | done                                                  |
| 1     | public visual baseline from typed seed content                    | done                                                  |
| 2     | owner recognition + owner UI shell (no QDN writes)                | done                                                  |
| 3     | QDN-backed CRUD, media, truthful outcomes                         | done (code); staging owner-runtime validation pending |
| 4     | owner-runtime validation, visual regression, documentation        | not started                                           |

Explicitly **not** in this repository: a derived index, migration/import tooling,
deployment or publication, and any physical QDN delete (Qortal has no
app-accessible one, so a delete is a tombstone). No QDN write has been exercised
against a live node from this repository, and the `WEBSITE` resource itself is
never republished by the app.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — stack, module boundaries, content model, phase seams
- [`docs/attribution.md`](docs/attribution.md) — per-asset source mapping, SHA-256 and retention decision
- [`docs/third-party-licences.md`](docs/third-party-licences.md) — MIT / SIL OFL notices for bundled dependencies
