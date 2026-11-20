# QWB architecture

Current implementation, updated 2026-11-20. The original architecture audit is
historical context, not the current feature status:
`/home/iffi/VsCodec-Projects/Qortal/qortal-dev-workspace/docs/qwb-qortal-web-builders/audits/2026-09-15-qwb-target-architecture-proposal.md`.

## Runtime and ownership

Vite, TypeScript and vanilla DOM modules produce a single-entry QDN `WEBSITE`.
Bootstrap is CSS only; DOMPurify sanitizes rich text. Hash routing and relative
build assets support Qortal render paths without server-side route fallback.

`config.ts` resolves the publishing name from `/render/WEBSITE/<name>/…` or
`/render/APP/<name>/…`. `qortal/owner.ts` compares the connected account with the
publishing name's account-name list/registered owner. Missing context or failed
checks deny owner tools. The viewer's name never determines the contact recipient.
`content/contact-link.ts` resolves Q-Mail destinations to the publishing name,
including historical hard-coded recipients in saved content.

## Modules and lifecycle

- `main.ts`: public reads, owner check, route rendering and teardown of owner,
  navbar and media handlers before replacing a view.
- `content/`: validated schema-v1 entities, seed fallback, QDN source, revisions,
  save verification, raw media URLs and runtime contact-link resolution.
- `qortal/adapter.ts`: public HTTP reads and bridge-based JSON/file publishes.
- `views/`: pure renderers receiving a content bundle. Text is escaped; formatted
  content passes through the DOMPurify allowlist in `owner/rich-text.ts`.
- `owner/console.ts`: contextual edit/add/hide/delete handlers and modal host.
  Its legacy console renderer is retained but is not mounted in the app.
- `owner/forms.ts` and `owner/controls.ts`: validated form conversion and separate
  labeled rows for links, navigation, contacts, section visibility and lists.
- `owner/file-snapshot.ts`: immediate FileReader copy into an owned in-memory File.
- `ui/qdn-media.ts`: host resource URL resolution, bounded error/build retries,
  dynamically added modal previews, and cancellation on route changes.

There is no visible central admin bar. Owners receive card-level edit/hide/delete
controls and section-level add/visibility controls. Hidden items have an owner-only
recovery list. Hidden sections/footer remain visible with an owner marker so they
can be restored; visitors see only the public projection. The modal keeps its
header and save controls fixed while its fields scroll.

## Routes

| Hash | View |
| --- | --- |
| `#/` or empty | home |
| `#section_1` … `#section_5` | legacy home anchors |
| `#/works` | portfolio index |
| `#/work/<slug>` | project, gallery and video |
| `#/posts` | article index |
| `#/post/<slug>` | article |
| other | not found |

`#main-content` is a reserved focus target, not a route. Same-view hash changes
scroll rather than replacing the view.

## Content and persistence

All entities, including articles, use QDN `JSON` under the publishing name.

| Kind | Identifier |
| --- | --- |
| site singleton | `qwb_site_v1` |
| service | `qwb_svc_*` |
| step | `qwb_step_*` |
| work | `qwb_work_*` |
| price | `qwb_price_*` |
| article | `qwb_post_*` |

The envelope includes schema, identifier, kind, revision, state, hidden flag,
timestamps, sparse order, title, payload and optional `richText` field map.
Identifiers are permanent, lowercase `[a-z0-9_-]`, at most 60 characters. Ordering
is order, creation timestamp, then identifier. Optional site UI copy has defaults
for older schema-v1 resources. Rich HTML supplements plain-text payloads and is
sanitized at render time; scripts, event handlers and unsafe link schemes are
removed. Structured CTA/navigation links accept hashes and `qortal://`; rich-text
links additionally accept HTTP(S), whose navigation depends on the Qortal host.

`ContentLoadResult` separates public `bundle` from owner `raw` and records
`publishedIds`. The QDN source overlays published resources on built-in seed
entities, retaining untouched seed content while honoring hidden/deleted records.
An invalid resource is skipped with diagnostics. Node/search/bundle problems
produce a diagnosed fallback rather than a blank page.

A seed entity's first save is a create (`expectedRev: null`, revision 1), not an
update of a nonexistent remote resource. Subsequent saves compare remote revisions.
`saveEntity` validates and checks the remote revision before publishing JSON and
reports success only after read-back matches. Conflicts and uncertain read-back
are reported explicitly. Failed saves keep the editor open for correction/retry.

Hide toggles the hidden flag. Delete republishes a tombstone with `state: deleted`
and a deletion timestamp after confirmation; it does not erase QDN bytes. Section
visibility and footer visibility are reversible site settings, not deletion of
the site's schema-defined section structure. Removing media removes its reference
from content; previously published media bytes remain on QDN.

## Media pipeline

1. Copy selected files immediately, preserving bytes independently of temporary
   document-provider permissions. Limits: images 10 MiB/file, videos 200 MiB.
2. Validate content, then publish media through `PUBLISH_QDN_RESOURCE` as raw
   `IMAGE` or `VIDEO`, using fresh bounded identifiers for replacement resources.
3. Store name, service/identifier, filename metadata and accessible text, then
   publish and verify the entity JSON. Empty galleries and video removal are valid.
4. Resolve display URLs through `GET_QDN_RESOURCE_URL`. Single-file resource URLs
   do not append the device filename. An absolute `/arbitrary/<service>/<name>/<id>`
   fallback works when the host URL resolver is unavailable. Delayed resources
   receive bounded retries with `GET_QDN_RESOURCE_STATUS` build requests.

Existing and selected media have previews, individual removal, clear-all and
restore-original controls. Selecting a gallery replaces it. Successfully uploaded
references are retained when JSON publishing fails so the owner can retry.

## Validation and boundaries

Vitest/jsdom cover schema, data loading, forms, ownership, revisions, file copying,
rich-text sanitization, media URLs and actions. `e2e/editor.mjs` runs real Chromium
with image and generated MP4 fixtures, a simulated Qortal bridge, and an HTTP
resource server. It verifies publishing bytes/order, public media load/playback,
reload, delayed resource resolution, removal, rich text and failed-save retry.
The simulated bridge does not replace a real Qortal runtime check.

The owner confirmed runtime tests passed on 2026-11-20 after the resource-URL fix.
Formal visual-baseline regression remains pending. Comments, visitor accounts,
full migration tooling, automated QDN deployment and a central admin dashboard
are outside the current implementation.
