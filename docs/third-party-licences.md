# Third-party licences

Everything this application bundles, with its upstream licence. Only licence
notices for code and fonts that are **actually distributed** in `dist/` are
included here; intentionally unbundled dependencies are listed at the end.

## Bootstrap 5.2.2 — MIT

Distributed as the npm package `bootstrap@5.2.2` and bundled into `dist/assets/style-*.css`
(Bootstrap CSS only; the JS bundle is deliberately not imported). Upstream:
<https://getbootstrap.com>

```text
The MIT License (MIT)

Copyright (c) 2011-2022 Twitter, Inc.
Copyright (c) 2011-2022 The Bootstrap Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Montserrat — SIL Open Font License 1.1

Self-hosted from `@fontsource/montserrat@5.3.0`, latin subset, woff2 only
(`montserrat-latin-{500,600,700}-normal.woff2`), referenced by
`src/styles/fonts.css`. Upstream: <https://github.com/JulietaUla/Montserrat>
Packaged by <https://fontsource.org>.

The published site declared Montserrat but never loaded it (its Google Fonts
`@import` is blocked by the production render CSP `font-src 'self' data:`).

```text
Copyright 2011 The Montserrat Project Authors (https://github.com/JulietaUla/Montserrat) Montserrat-Italic[wght].ttf: Copyright 2011 The Montserrat Project Authors (https://github.com/JulietaUla/Montserrat)

-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## Open Sans — SIL Open Font License 1.1

Self-hosted from `@fontsource/open-sans@5.3.0`, latin subset, woff2 only
(`open-sans-latin-{400,600}-normal.woff2`), referenced by `src/styles/fonts.css`.
Upstream: <https://github.com/googlefonts/opensans>
Packaged by <https://fontsource.org>.

```text
Copyright 2020 The Open Sans Project Authors (https://github.com/googlefonts/opensans) OpenSans-Italic[wdth,wght].ttf: Copyright 2020 The Open Sans Project Authors (https://github.com/googlefonts/opensans)

-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

Both font families ship under the same OFL 1.1 text reproduced above; only the
copyright holder differs. There is no separate "Reserved Font Name" beyond the
family names themselves, so the woff2 subsets are redistributed unmodified.

## DOMPurify — Apache-2.0 OR MPL-2.0

`dompurify` (resolved version in `package-lock.json`) is bundled into the app's
JavaScript to sanitize owner-authored rich text. Upstream:
<https://github.com/cure53/DOMPurify>. Copyright Cure53 and contributors.
DOMPurify offers a choice of Apache License 2.0 or Mozilla Public License 2.0;
its upstream licence text is distributed in the npm package's `LICENSE`:
<https://github.com/cure53/DOMPurify/blob/main/LICENSE>.

Playwright (`@playwright/test`, Apache-2.0) is a development-only browser-test
dependency and is not shipped in the QDN archive. FFmpeg is an external local
test prerequisite for generating the MP4 fixture and is not bundled.

## Intentionally not bundled

| Dependency                                    | Licence                      | Why it is absent                                                                                                                                                          |
| --------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap Icons                               | MIT                          | Not installed, imported or bundled by the current app.                                                                                                                    |
| jQuery 2.2.3, `jquery.sticky`, `click-scroll` | MIT                          | The obsolete plugin layer. Its behaviour is reimplemented natively in `src/ui/nav.ts` and `src/ui/scroll-to-top.ts`; no jQuery code is loaded.                            |
| `bootstrap.bundle.min.js`                     | MIT                          | The Bootstrap JS components are not used (the navbar collapse and the tab strip are native implementations), so the JS bundle is not imported and does not reach `dist/`. |
| `templatemo-topic-listing` theme CSS          | Template licence, unrecorded | Not redistributed. The design tokens and class vocabulary were re-expressed in `src/styles/`; the original stylesheet is not shipped.                                     |

## unDraw illustrations

Three illustration PNGs attributed to unDraw are bundled (see
[`attribution.md`](attribution.md#illustrations)). Their licence status
is recorded there as **unDraw-assumed, not proven from the files**. unDraw's terms
permit use without attribution; this is an assumption about the artefacts rather
than a verified licence, and it is flagged for owner confirmation. No third-party
licence text can be reproduced for them because none accompanies the files.
