# Asset and source attribution

Every asset bundled in this repository is listed here with its origin, its
SHA-256, and the decision taken. The golden master itself is **not** redistributed:
it stays read-only at
`/home/iffi/VsCodec-Projects/QWB-Qortal-Web-Builders/-PUBLISHED-versioon`, and only
the files below were copied out.

Golden-master manifest used for verification:
`…/docs/qwb-qortal-web-builders/validation/2026-09-15-qwb-golden-master-sha256.txt`
(manifest digest `18e2a960cc126cb34ab68c432c5a8a1331c980fbb187db38f63d7ad063b95a43`).

## 1. Carried forward — byte-identical copies

All ten files below were verified byte-identical to the golden master
(`sha256sum` equality against the manifest above) at copy time.

### Brand and structural assets (owner-provided brand assets)

| Golden-master path                    | This repository                       | SHA-256                                                            | Origin / licence                                       |
| ------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `images/qwb-icon-trans-192x192.png`   | `public/qwb-icon-trans-192x192.png`   | `ed0da1af116dfa865da153bdc6fd7a4e2e41abe1f1b9f38bfdb934a0dd0991ff` | Owner brand asset (circular QWB mark, transparent PNG) |
| `images/favicon.svg`                  | `public/favicon.svg`                  | `de429e12c271758d914628d223f22ccf11988d7d56f8d158d083f351f7a5d267` | Owner brand asset, derived from the mark               |
| `images/favicon.ico`                  | `public/favicon.ico`                  | `af398f3eafe912d8dfc9ccfe8c8ff2b628580d3976e078958acde3307243e19c` | Owner brand asset, derived from the mark               |
| `images/favicon-96x96.png`            | `public/favicon-96x96.png`            | `9fd29b13c4e2ef724f49ddd46d16f48f0b566e7c810e38a6a49518556929fb67` | Owner brand asset, derived from the mark               |
| `images/apple-touch-icon.png`         | `public/apple-touch-icon.png`         | `e6b4f6d27a4b4a6844d0eb57ac95341baeae0662f21607542e841fe0d8252ffb` | Owner brand asset                                      |
| `images/web-app-manifest-192x192.png` | `public/web-app-manifest-192x192.png` | `7e0ecc12cb6134162f9001173c0c307ec2729dc3b8eca6069081f63504fc5577` | Owner brand asset                                      |
| `images/web-app-manifest-512x512.png` | `public/web-app-manifest-512x512.png` | `112dd84dc088f9158fe26b2385fefe88c9b267a0d46c9d7ed28cbfa114f8fc01` | Owner brand asset                                      |

These are the only images kept as-is. They are the mark and its derivatives served
from the site root; they belong in the published archive rather than in QDN-managed
content media (owner decision D3).

### Illustrations (unDraw)

| Golden-master path                                    | This repository                                                  | SHA-256                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `images/topics/undraw_Remote_design_team_re_urdx.png` | `src/assets/illustrations/undraw_Remote_design_team_re_urdx.png` | `b8071614161a05a09b4185406d9ed56fc2e3969d436084cb46601a989f656fb9` |
| `images/topics/undraw_Redesign_feedback_re_jvm0.png`  | `src/assets/illustrations/undraw_Redesign_feedback_re_jvm0.png`  | `34e513508665afb45ec1c3dda44f2f6099b23d608a99b6868c48d8e2da088986` |
| `images/topics/undraw_Graduation_re_gthn.png`         | `src/assets/illustrations/undraw_Graduation_re_gthn.png`         | `78834ab8a8c0f686bd3cd9bf7b858e04dc2971603d59e2b2c134bb1dfaa94a20` |

Origin: the unDraw illustration set (`https://undraw.co`), shipped with the
published site under the `images/topics/` directory. Identified by the `undraw_*`
filename convention and the consistent flat-colour illustration style; the files
carry no embedded licence metadata.

**Licence status: unDraw-assumed, not proven from the files.** unDraw's own terms
permit use without attribution, but that cannot be established from the artefacts
alone, so this is recorded as an assumption rather than a verified licence. The
two illustrations used by the published pages are used unchanged; the third
(`undraw_Graduation_re_gthn.png`) is an unreferenced file from the same directory
and is used for the "Launch and handover" step.

**Owner action if the assumption is unacceptable:** these three illustrations are
non-structural. Replacing them requires only a new image file and the
corresponding `ImageRef` in `src/content/seed.ts` — no code change, no layout
change.

## 2. Edited, not copied

| Asset                     | Change                                   | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public/site.webmanifest` | Rewritten from `images/site.webmanifest` | The published manifest used **root-absolute** icon paths (`/web-app-manifest-*.png`), which resolve to the node root — not to the QDN resource — and would 404 in a host. Paths are relative here; `name`, `description`, `start_url`, `scope`, `theme_color` and `background_color` were filled in. Golden-master SHA `015a5e02a0cbbfdcb71868a11c57943dcf512b83ddff8e8b5f5b37192a33e136`; this repository's SHA `b5a1fd758aba0d4fb2dbd3f093c64aa5bd48e43f3217ce761e57ef0cd985338d`. |

## 3. Deliberately **not** carried forward

| Golden-master asset                                                                                                                           | Decision                    | Reason                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `images/businesswoman-using-tablet-analysis.jpg`                                                                                              | dropped                     | Unknown-provenance stock photography (owner decision D4: do not carry unknown-licence imagery forward).                                                                                           |
| `images/colleagues-working-cozy-office-medium-shot.jpg`                                                                                       | dropped                     | Unknown-provenance stock photography.                                                                                                                                                             |
| `images/topics/colleagues-working-cozy-office-medium-shot.png`                                                                                | dropped                     | Same image, PNG variant.                                                                                                                                                                          |
| `images/faq_graphic.jpg`                                                                                                                      | dropped                     | Unknown-provenance stock photography.                                                                                                                                                             |
| `images/rear-view-young-college-student.jpg`                                                                                                  | dropped                     | Unknown-provenance stock photography.                                                                                                                                                             |
| `images/icons/q-mail-centered-350x250.png`                                                                                                    | dropped                     | Used only by the removed newsletter/mail template blocks.                                                                                                                                         |
| `images/web-preview/*.png` (8 files, 6.6 MB)                                                                                                  | dropped                     | 74 % of the published payload. Portfolio previews become QDN-managed `THUMBNAIL` media in Phase 2–3; Phase 1 renders deterministic on-brand placeholder covers instead.                           |
| `images/topics/undraw_{Compose_music, Educator, Finance, Group_video, Podcast_audience, happy_music, online_ad, viral_tweet}_*.png` (8 files) | dropped                     | Unreferenced leftovers from the original template's topic gallery; the published site never loaded them.                                                                                          |
| `css/bootstrap-icons.css`, `fonts/bootstrap-icons.woff{,2}`                                                                                   | dropped                     | Bootstrap Icons is not used by any rendered component (the theme's icon font was only referenced by removed template markup). Recorded in `third-party-licences.md` as intentionally not bundled. |
| `js/jquery.min.js`, `js/jquery.sticky.js`, `js/click-scroll.js`, `js/custom.js`, `js/bootstrap.bundle.min.js`                                 | dropped                     | The obsolete jQuery/plugin layer. Its behaviour is reimplemented natively in `src/ui/`; Bootstrap is kept as CSS only.                                                                            |
| `css/bootstrap.min.css`                                                                                                                       | replaced by the npm package | Same version (5.2.2) pulled from the registry rather than vendored, so the licence notice and version are traceable.                                                                              |
| `css/templatemo-topic-listing.css`                                                                                                            | rewritten as `src/styles/`  | The theme layer is preserved token-by-token and class-name-by-class-name, but rebuilt without the dead template components and the corrupted SCSS tail (see `docs/architecture.md` §5).           |

The published-site HTML files are **not** carried forward in any form. Their role
was limited to visual structure, asset reuse and evidence of the previous
identity; the copy is rewritten and there is no migration script.

## 4. Unknown-provenance imagery: statement

No `.jpg`/`.jpeg` file exists anywhere in this repository, and no stock photograph
from the published site is referenced. `tests/schema.test.ts` asserts both the
absence of legacy stock imagery and the absence of the old `Builded to HTML
Template` copy in the seed bundle, so a future edit cannot silently reintroduce
them.
