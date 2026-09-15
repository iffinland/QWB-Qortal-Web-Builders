/**
 * Phase-1 seed content.
 *
 * Typed mock content that reproduces the published site's structure with the
 * repositioned message (custom websites and custom Qortal apps built around
 * client-specific visual and functional requirements).
 *
 * Provenance rules applied here (see docs/attribution.md):
 *  - the four published prose pages are rewritten and re-seeded as `article`
 *    entities; their Qortal touchpoints are kept;
 *  - the portfolio list is the owner's real published list of QDN websites, with
 *    the "Builded to/using …" typos corrected and no preview screenshots carried
 *    forward (`placeholder` covers instead);
 *  - pricing keeps the owner's currently published QORT price points;
 *  - no stock photography of unknown provenance is referenced anywhere.
 *
 * There is no import/migration tooling: this file is the intentionally clean
 * starting point that the owner replaces through inline editing in Phase 2-3.
 */

import type {
  ArticleEntity,
  ContentBundle,
  EntityKind,
  HighlightEntity,
  PriceEntity,
  ServiceEntity,
  SiteEntity,
  StepEntity,
  WorkEntity,
} from './schema';
import { SCHEMA_VERSION, identifierPrefixFor } from './schema';

import graduationIllustration from '../assets/illustrations/undraw_Graduation_re_gthn.png';
import redesignIllustration from '../assets/illustrations/undraw_Redesign_feedback_re_jvm0.png';
import remoteDesignIllustration from '../assets/illustrations/undraw_Remote_design_team_re_urdx.png';

/** Deterministic timestamps: the seed snapshot is not "created over time". */
const SEED_AT = 1789430400000; // 2026-09-15T00:00:00Z
const SEED_TS36 = SEED_AT.toString(36);

const KIND_BY_PREFIX: Readonly<Record<string, EntityKind>> = {
  hl: 'highlight',
  svc: 'service',
  step: 'step',
  work: 'work',
  price: 'price',
  post: 'article',
};

/**
 * Builds a seed identifier that satisfies the approved identifier policy
 * (`qwb_<kind>_<slug>-<ts36>-<rand>`, lowercase `[a-z0-9-]`, <= 60 chars, never
 * reused). Published identifiers are generated the same way in Phase 3.
 */
function seedId(prefix: string, slug: string, random: string): string {
  const kind = KIND_BY_PREFIX[prefix];
  if (kind === undefined) throw new Error(`unknown identifier prefix: ${prefix}`);
  return `${identifierPrefixFor(kind)}${slug}-${SEED_TS36}-${random}`;
}

/* Qortal touchpoints kept from the published site (approved decision D8). */
const QDN_SELF = 'qortal://WEBSITE/Qortal%20Web%20Builders';
const QDN_TEMPLATE_GALLERY = 'qortal://WEBSITE/HTML-web';
const QDN_GROUP = 'qortal://use-group/action-join/groupid-745';
const QDN_QMAIL = 'qortal://APP/Q-Mail/to/Qortal20Web%20Builders';
const QDN_QSHOP = 'qortal://APP/Q-Shop/Qortal%20Web%20Builders/q-store-general-qortal-web-builders';

const brandMark = 'qwb-icon-trans-192x192.png';

/* -------------------------------------------------------------------------- */
/* site                                                                        */
/* -------------------------------------------------------------------------- */

const site: SiteEntity = {
  schema: SCHEMA_VERSION,
  id: 'qwb_site_v1',
  kind: 'site',
  rev: 1,
  state: 'active',
  createdAt: SEED_AT,
  updatedAt: SEED_AT,
  deletedAt: null,
  order: 10,
  title: 'Qortal Web Builders',
  payload: {
    brand: {
      name: 'QWB - Qortal Web Builders',
      markSrc: brandMark,
      since: 'since 2025',
      tagline: 'Custom websites and custom Qortal apps, built around your project.',
    },
    /* The four-link navbar of the published site is preserved verbatim.
       `#section_*` targets are legacy anchors kept for link continuity. */
    nav: [
      { label: 'Home', href: '#/' },
      { label: 'Browse Topics', href: '#section_2' },
      { label: 'Prices', href: '#section_3' },
      { label: 'Contact', href: '#section_5' },
    ],
    hero: {
      heading: 'Custom websites & Qortal apps, built around you 🤗',
      subtitle:
        'We design and build individually tailored websites and Qortal applications — visual identity, layout, functions and behaviour shaped around what your project actually needs.',
    },
    sections: [
      /* `label` is the section heading shown on the page (hero/contact have
         their own heading fields); `visible` and the array order drive whether
         and where a section renders. */
      { id: 'section_1', label: 'Hero', visible: true },
      { id: 'section_featured', label: 'Highlights', visible: true },
      {
        id: 'section_2',
        label: 'Browse Topics',
        visible: true,
        cta: { label: 'Start a project', href: QDN_QMAIL },
      },
      { id: 'section_3', label: 'Custom design, priced by the work it needs', visible: true },
      { id: 'section_5', label: 'Contact', visible: true },
    ],
    tabs: [{ label: 'How we build' }, { label: 'Completed works' }, { label: 'What we build' }],
    contact: {
      heading: 'Get in touch',
      columns: [
        {
          title: "Let's chat!",
          rows: [
            { label: 'Q-Mail', value: 'click to open apps', href: QDN_QMAIL },
            { label: 'PM to', value: 'qortal web builders', href: QDN_GROUP },
          ],
        },
        {
          title: 'Join the LIVE Chat & Forum',
          rows: [
            { label: 'Group name', value: 'Qortal Web Builders', href: QDN_GROUP },
            { label: 'Group ID', value: '745', href: QDN_GROUP },
          ],
        },
      ],
    },
    footer: {
      credit: [
        { text: 'hosted by 100% censorship free QDN and does not use cookies |¤| Design: ' },
        { text: 'Qortal Web Builders', href: QDN_SELF },
        { text: ' |¤| Built on the ' },
        { text: 'QWBT-1', href: QDN_TEMPLATE_GALLERY },
        { text: ' HTML template' },
      ],
      creditNote: 'Custom websites, custom Qortal apps and design work by Qortal Web Builders.',
    },
    meta: {
      title: 'QWB - Qortal Web Builders | custom websites and custom Qortal apps',
      description:
        'Qortal Web Builders designs and builds custom websites and custom Qortal apps, shaped around each project’s visual and functional requirements.',
    },
  },
};

/* -------------------------------------------------------------------------- */
/* highlights (the featured pair)                                              */
/* -------------------------------------------------------------------------- */

const highlights: readonly HighlightEntity[] = [
  {
    schema: SCHEMA_VERSION,
    id: seedId('hl', 'custom-design', 'a1'),
    kind: 'highlight',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 10,
    title: '✨ A website that looks like nobody else ✨',
    payload: {
      body: 'Why is a custom design worth it?',
      bullets: [
        'We start from your project, your audience and your brand — not from a template somebody else already uses',
        'Layout, colour, typography and functions are designed for you instead of being configured around you',
      ],
      variant: 'plain',
      cta: { label: 'Learn more', href: '#/post/valuing-your-time' },
    },
  },
  {
    schema: SCHEMA_VERSION,
    id: seedId('hl', 'own-website', 'a2'),
    kind: 'highlight',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 20,
    title: '✨ Why your own website matters ✨',
    payload: {
      body: 'A website is the one place where your project is presented completely and on your own terms.',
      bullets: [
        'Visitors get the whole picture in minutes instead of hunting through scattered posts and profile pages',
        'One address you control — hosted on the Qortal Data Network, without a hosting account or a monthly bill',
        'Custom functions and Qortal integrations that a ready-made site builder cannot give you',
      ],
      variant: 'overlay',
      cta: { label: 'Learn more', href: '#/post/why-do-you-need-a-own-website' },
    },
  },
];

/* -------------------------------------------------------------------------- */
/* services (the "What we build" pane)                                         */
/* -------------------------------------------------------------------------- */

const services: readonly ServiceEntity[] = [
  {
    schema: SCHEMA_VERSION,
    id: seedId('svc', 'custom-websites', 'b1'),
    kind: 'service',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 10,
    title: 'Custom websites',
    payload: {
      summary:
        'Individual visual identity, layout, structure and content — designed for your project instead of configured around a shared theme.',
      bullets: [],
      icon: '🎨',
    },
  },
  {
    schema: SCHEMA_VERSION,
    id: seedId('svc', 'custom-qortal-apps', 'b2'),
    kind: 'service',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 20,
    title: 'Custom Qortal apps',
    payload: {
      summary:
        'QDN-hosted applications with the functions your project needs, from a small utility to a full management tool with owner editing.',
      bullets: [],
      icon: '🧩',
    },
  },
  {
    schema: SCHEMA_VERSION,
    id: seedId('svc', 'visual-identity', 'b3'),
    kind: 'service',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 30,
    title: 'Visual identity and design',
    payload: {
      summary:
        'Colour, typography, illustration and composition developed for your brand, so the result is recognisable as yours.',
      bullets: [],
      icon: '🖌️',
    },
  },
  {
    schema: SCHEMA_VERSION,
    id: seedId('svc', 'updates-and-care', 'b4'),
    kind: 'service',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 40,
    title: 'Updates and care',
    payload: {
      summary:
        'Changes, extensions and fixes after launch, priced by the actual scope of the work rather than by a subscription.',
      bullets: [],
      icon: '🛠️',
    },
  },
];

/* -------------------------------------------------------------------------- */
/* steps (the "How we build" pane)                                             */
/* -------------------------------------------------------------------------- */

const steps: readonly StepEntity[] = [
  {
    schema: SCHEMA_VERSION,
    id: seedId('step', 'planning', 'c1'),
    kind: 'step',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 10,
    title: 'Order reception and planning',
    payload: {
      description:
        'We go through your goal, your audience, the visual direction and the functions your project needs before any code exists.',
      illustration: {
        source: 'bundled',
        src: remoteDesignIllustration,
        alt: 'Illustration of a designer and a developer planning a website layout together',
      },
      link: { label: 'Read the full process', href: '#/post/order-reception-and-planning' },
    },
  },
  {
    schema: SCHEMA_VERSION,
    id: seedId('step', 'design-and-build', 'c2'),
    kind: 'step',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 20,
    title: 'Design and build',
    payload: {
      description:
        'We build the first real version so you can see it in a Qortal host, then iterate with you until the result is right.',
      illustration: {
        source: 'bundled',
        src: redesignIllustration,
        alt: 'Illustration of a designer reviewing and reshaping a website layout',
      },
      link: { label: 'Read the full process', href: '#/post/order-reception-and-planning' },
    },
  },
  {
    schema: SCHEMA_VERSION,
    id: seedId('step', 'launch-and-handover', 'c3'),
    kind: 'step',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 30,
    title: 'Launch and handover',
    payload: {
      description:
        'Final checks, the finished files published under your own account, and one free update round within 30 days.',
      illustration: {
        source: 'bundled',
        src: graduationIllustration,
        alt: 'Illustration of a finished project being handed over',
      },
      link: { label: 'Read the full process', href: '#/post/order-reception-and-planning' },
    },
  },
];

/* -------------------------------------------------------------------------- */
/* works (portfolio)                                                           */
/* -------------------------------------------------------------------------- */

type WorkSeed = {
  readonly id: string;
  readonly title: string;
  readonly buildKind: string;
  readonly href: string;
  readonly featured: boolean;
};

const workSeeds: readonly WorkSeed[] = [
  {
    id: seedId('work', 'asot', 'd1'),
    title: 'ASOT | A State Of Trance',
    buildKind: 'Custom HTML build',
    href: 'qortal://WEBSITE/ASOT%20-%20A%20State%20Of%20Trance',
    featured: true,
  },
  {
    id: seedId('work', 'html-web', 'd2'),
    title: 'HTML web @ Qortal Web Builders',
    buildKind: 'Template gallery site',
    href: QDN_TEMPLATE_GALLERY,
    featured: true,
  },
  {
    id: seedId('work', 'iffi-vaba-mees', 'd3'),
    title: 'iffi vaba mees',
    buildKind: 'Custom HTML build',
    href: 'qortal://WEBSITE/iffi%20vaba%20mees',
    featured: true,
  },
  {
    id: seedId('work', 'suomi-finland', 'd4'),
    title: 'Qortal Suomi - Finland',
    buildKind: 'Publii CMS content site',
    href: 'qortal://WEBSITE/Suomi%20-%20Finland',
    featured: false,
  },
  {
    id: seedId('work', 'svik', 'd5'),
    title: 'SVIK | Suomen Vapaiden Ihmisten Kommuuni',
    buildKind: 'Publii CMS content site',
    href: 'qortal://WEBSITE/suomen%20vapaiden%20ihmisten%20kommuuni',
    featured: false,
  },
  {
    id: seedId('work', 'iffi-forest-life', 'd6'),
    title: 'iffi forest life',
    buildKind: 'Publii CMS content site',
    href: 'qortal://WEBSITE/iffi%20forest%20life',
    featured: false,
  },
  {
    id: seedId('work', 'eestlased-qortalis', 'd7'),
    title: 'Eestlased Qortalis',
    buildKind: 'Publii CMS content site',
    href: 'qortal://WEBSITE/Eestlased%20Qortalis',
    featured: false,
  },
  {
    id: seedId('work', 'our-own-site', 'd8'),
    title: 'Of course our own website',
    buildKind: 'Custom HTML build',
    href: QDN_SELF,
    featured: false,
  },
];

const works: readonly WorkEntity[] = workSeeds.map((seed, index) => ({
  schema: SCHEMA_VERSION,
  id: seed.id,
  kind: 'work',
  rev: 1,
  state: 'active',
  createdAt: SEED_AT,
  updatedAt: SEED_AT,
  deletedAt: null,
  order: (index + 1) * 10,
  title: seed.title,
  payload: {
    buildKind: seed.buildKind,
    summary: `Published on the Qortal Data Network under the name ${seed.title}.`,
    links: [{ label: 'Watch live website', href: seed.href }],
    /* Phase-1 placeholders: the published preview screenshots are not carried
       forward. They become QDN-managed media (THUMBNAIL) in Phase 2-3. */
    cover: { source: 'placeholder', label: seed.title, alt: `Preview of ${seed.title}` },
    featured: seed.featured,
  },
}));

/* -------------------------------------------------------------------------- */
/* prices                                                                     */
/* -------------------------------------------------------------------------- */

const prices: readonly PriceEntity[] = [
  {
    schema: SCHEMA_VERSION,
    id: seedId('price', 'custom-website', 'e1'),
    kind: 'price',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 10,
    title: 'Custom website',
    payload: {
      lines: [
        { icon: '✅', text: 'Individual design and code — unique and eye-catching' },
        { icon: '💰', text: 'From 123 QORT — and your website is ready' },
        { icon: '🎨', text: 'Layout, colours and functions built around your project' },
        { icon: '🔄', text: 'One free update within 30 days of delivery' },
        { icon: '🛠️', text: 'Further updates from 30 QORT, priced by scope' },
      ],
      cta: { label: 'Order now 🚀', href: QDN_QSHOP },
      note: 'A website on its own, or a website plus a custom Qortal app.',
    },
  },
  {
    schema: SCHEMA_VERSION,
    id: seedId('price', 'custom-build', 'e2'),
    kind: 'price',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 20,
    title: 'Custom build or open challenge',
    payload: {
      lines: [
        { icon: '🧐', text: 'Got a challenge? Let’s tackle it together' },
        { icon: '💰', text: 'Kick things off with 5 QORT — opens a support ticket' },
        { icon: '✍️', text: 'Give us a rundown of what the app or the fix has to do' },
        { icon: '🚀', text: 'We plan the build and the functions it needs' },
        { icon: '⚖️', text: 'Final pricing depends on the scope of the work' },
      ],
      cta: { label: 'Order now 🚀', href: QDN_QSHOP },
      note: 'Websites, Qortal apps, or a mix of both.',
    },
  },
];

/* -------------------------------------------------------------------------- */
/* articles                                                                   */
/* -------------------------------------------------------------------------- */

const articles: readonly ArticleEntity[] = [
  {
    schema: SCHEMA_VERSION,
    id: seedId('post', 'order-reception-and-planning', 'f1'),
    kind: 'article',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 10,
    title: 'How we build your website, step by step',
    payload: {
      slug: 'order-reception-and-planning',
      summary:
        'From your first message to the finished files: what happens after you order, and what we need from you along the way.',
      heroImage: {
        source: 'bundled',
        src: remoteDesignIllustration,
        alt: 'Illustration of a designer and a developer planning a website layout together',
      },
      blocks: [
        {
          type: 'note',
          text: 'Here’s a brief overview of the process from order placement to website completion and delivery.',
        },
        {
          type: 'bullets',
          items: [
            [
              { text: 'When your order arrives, we contact you through ' },
              { text: 'Q-Mail', href: QDN_QMAIL },
              { text: ' to collect the details of the website or app you want.' },
            ],
            [
              { text: 'Joining our ' },
              { text: 'live Q-Mail group', href: QDN_GROUP },
              {
                text: ' usually makes the discussion faster. It is public and optional — plain Q-Mail works just as well.',
              },
            ],
            [
              { text: 'Anyone can join that group and ask questions before ordering. Look for ' },
              { text: 'Qortal Web Builders (ID 745)', href: QDN_GROUP },
              { text: '.' },
            ],
            [
              {
                text: 'Once we have your information and materials, we build the first visual version and put it on a test resource, so you see it in a real Qortal host rather than in a screenshot.',
              },
            ],
            [
              {
                text: 'You review that version and tell us what to change. We adjust and show you the next one — this loop is how the design becomes yours instead of ours.',
              },
            ],
            [
              {
                text: 'When everything matches what you had in mind, we do a final check for small errors and hand over the finished website files as a ZIP archive, which you publish with your own Qortal account.',
              },
            ],
            [
              {
                text: 'After delivery you have one free update within 30 days. It covers small fixes and small changes, not a redesign.',
              },
            ],
            [
              {
                text: 'Further updates start at 30 QORT. The final price depends on the scope of the change and we always agree it with you beforehand.',
              },
            ],
          ],
        },
        {
          type: 'note',
          text: 'A small checklist helps you prepare in advance — take your time with it, the result improves when the thinking happens before the building.',
          action: {
            label: 'Click here to see helpful information',
            href: '#/post/what-information-do-we-want-first',
          },
        },
      ],
      tags: ['process', 'getting started'],
    },
  },
  {
    schema: SCHEMA_VERSION,
    id: seedId('post', 'why-do-you-need-a-own-website', 'f2'),
    kind: 'article',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 20,
    title: 'Why do you need your own website?',
    payload: {
      slug: 'why-do-you-need-a-own-website',
      summary:
        'A website is the one place where your project is presented completely, on your own terms, and in minutes rather than in fragments.',
      heroImage: {
        source: 'bundled',
        src: remoteDesignIllustration,
        alt: 'Illustration of a designer and a developer planning a website layout together',
      },
      blocks: [
        {
          type: 'paragraph',
          text: 'A website is your digital business card — a place where the important information is presented quickly and clearly, without making visitors search for it or sift through long texts. If you want people to get a fast, professional overview of you or your business, a website is still the most direct way to do it.',
        },
        { type: 'heading', text: '💡 But isn’t social media or a blog enough?' },
        {
          type: 'paragraph',
          text: 'Say you have a blog or active social pages full of detailed posts and product descriptions. That is great. But now imagine somebody wants a quick introduction to what you do. What happens?',
        },
        {
          type: 'bullets',
          items: [
            [{ text: 'You send several links and hope the person reads all of them.' }],
            [{ text: 'Your information is scattered, so the full picture stays out of reach.' }],
            [{ text: 'Long texts take time — and most people simply do not have that time.' }],
          ],
        },
        { type: 'heading', text: '📌 That is where a website comes in.' },
        {
          type: 'paragraph',
          text: 'With one well-structured website you present everything essential at a glance. In a few minutes your visitor knows who you are, what you offer and how to reach you — and on Qortal it is hosted censorship-free, without a hosting provider in between.',
        },
        {
          type: 'note',
          text: 'Want your project to be clearly represented and easily understood? Tell us what it needs.',
          action: { label: 'Start a project via Q-Mail', href: QDN_QMAIL },
        },
      ],
      tags: ['positioning', 'qdn hosting'],
    },
  },
  {
    schema: SCHEMA_VERSION,
    id: seedId('post', 'valuing-your-time', 'f3'),
    kind: 'article',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 30,
    title: 'Valuing your time',
    payload: {
      slug: 'valuing-your-time',
      summary:
        'What you actually buy when you buy a custom website: investigation, planning and the tooling that keeps the work short.',
      heroImage: {
        source: 'bundled',
        src: redesignIllustration,
        alt: 'Illustration of a designer reviewing and reshaping a website layout',
      },
      blocks: [
        { type: 'heading', text: 'How we can help value your time' },
        {
          type: 'bullets',
          items: [
            [
              {
                text: 'We think and plan before we build, so the decisions are made once instead of twice.',
              },
            ],
            [
              {
                text: 'We look for the most suitable solution for your case, not for the one we sell most often.',
              },
            ],
            [
              {
                text: 'We bring the right tools to the work — layout, code, illustration and Qortal know-how.',
              },
            ],
          ],
        },
        {
          type: 'paragraph',
          text: 'Want something different from the usual modern-looking sites? We build eye-catching websites with a character of their own, designed to be remembered rather than scrolled past.',
        },
        {
          type: 'bullets',
          items: [
            [
              {
                text: 'Our websites do not rely on a locked-in platform. We write the code for your design, or adapt a high-quality HTML template when that genuinely serves the project.',
              },
            ],
            [
              {
                text: 'You also get the option of a custom Qortal app for the parts a website cannot do well: owner editing, QDN data, specific workflows and integrations.',
              },
            ],
            [
              {
                text: 'The result is a project without the limits of a pre-built solution — convenient is not the same as sufficient.',
              },
            ],
          ],
        },
        {
          type: 'note',
          text: 'Need a website or an app for your project? Look at what we have built so far, then tell us what yours has to do.',
          action: { label: 'See our completed works', href: '#/works' },
        },
      ],
      tags: ['process', 'custom design'],
    },
  },
  {
    schema: SCHEMA_VERSION,
    id: seedId('post', 'what-information-do-we-want-first', 'f4'),
    kind: 'article',
    rev: 1,
    state: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order: 40,
    title: 'What information do we want first?',
    payload: {
      slug: 'what-information-do-we-want-first',
      summary:
        'A checklist you can prepare in advance, so the first conversation already starts from something concrete.',
      heroImage: {
        source: 'bundled',
        src: remoteDesignIllustration,
        alt: 'Illustration of a designer and a developer planning a website layout together',
      },
      blocks: [
        {
          type: 'note',
          text: 'Here you find tips on what we need at the beginning, so you can start preparing.',
        },
        {
          type: 'bullets',
          items: [
            [
              {
                text: 'The display name for the site, if you want it to differ from your Qortal name.',
              },
            ],
            [{ text: 'A slogan or tagline, if you wish to have one.' }],
            [
              {
                text: 'Whether it is a single-page site, a multi-page site, or a Qortal app — and whether it needs a blog, a gallery or product pages.',
              },
            ],
            [{ text: 'Who the site is aimed at and what its purpose is.' }],
            [
              {
                text: 'Whether you plan to publish long-form posts and videos here, or use ',
              },
              { text: 'Q-Blog', href: 'qortal://APP/Q-Blog' },
              { text: ' and ' },
              { text: 'Q-Tube', href: 'qortal://APP/Q-Tube' },
              {
                text: ' and link to them. Keeping long media out of the app archive keeps it fast to load.',
              },
            ],
            [
              {
                text: 'What the design should feel like, and whether you have seen something you like.',
              },
            ],
            [{ text: 'The initial texts you want on the site.' }],
            [
              {
                text: 'Whether you need a logo, banner, icons or other graphic elements — we can design those too.',
              },
            ],
            [
              {
                text: 'Anything else about your vision for the project, including questions you could not answer.',
              },
            ],
          ],
        },
        {
          type: 'note',
          text: 'This checklist is a general one and nothing has to be perfect from the start. The result takes shape step by step.',
          action: { label: 'Send your details via Q-Mail', href: QDN_QMAIL },
        },
      ],
      tags: ['process', 'checklist'],
    },
  },
];

/* -------------------------------------------------------------------------- */

export const seedBundle: ContentBundle = {
  site,
  highlights,
  services,
  steps,
  works,
  prices,
  articles,
};
