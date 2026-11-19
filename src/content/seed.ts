/**
 * Beta seed content.
 *
 * Typed starting content that the app shows until the owner publishes the QDN
 * entities (see `qdn-source.ts`). It keeps the owner's real portfolio list and
 * Qortal touchpoints, and it deliberately contains NO specific prices: pricing is
 * per project and is offered as a free, no-obligation quote. The outdated
 * QORT price points of the previous site were removed on purpose.
 *
 * Provenance rules (see docs/attribution.md):
 *  - the brand logo and icon are the owner-supplied QWB artwork;
 *  - the illustrations are the unDraw set already documented there;
 *  - project covers are deterministic placeholders, not screenshots.
 */

import type {
  ArticleEntity,
  ContentBundle,
  PriceEntity,
  ServiceEntity,
  SiteEntity,
  StepEntity,
  WorkEntity,
} from './schema';
import { SCHEMA_VERSION, identifierPrefixFor } from './schema';
import type { EntityKind } from './schema';

import graduationIllustration from '../assets/illustrations/undraw_Graduation_re_gthn.png';
import redesignIllustration from '../assets/illustrations/undraw_Redesign_feedback_re_jvm0.png';
import remoteDesignIllustration from '../assets/illustrations/undraw_Remote_design_team_re_urdx.png';
import logoFull from '../assets/brand/qwb-logo-full.jpg';
import iconMark from '../assets/brand/qwb-icon-512.png';

/** Deterministic timestamps: the seed snapshot is not "created over time". */
const SEED_AT = 1789430400000; // 2026-09-15T00:00:00Z
const SEED_TS36 = SEED_AT.toString(36);

/** Builds a seed identifier that satisfies the identifier policy. */
function seedId(kind: EntityKind, slug: string, random: string): string {
  return `${identifierPrefixFor(kind)}${slug}-${SEED_TS36}-${random}`;
}

/* Qortal touchpoints kept from the published site. */
const QDN_SELF = 'qortal://WEBSITE/Qortal%20Web%20Builders';
const QDN_TEMPLATE_GALLERY = 'qortal://WEBSITE/HTML-web';
const QDN_GROUP = 'qortal://use-group/action-join/groupid-745';
const QDN_QMAIL = 'qortal://APP/Q-Mail/to/Qortal20Web%20Builders';

function base<K extends EntityKind>(kind: K, id: string, order: number, title: string) {
  return {
    schema: SCHEMA_VERSION,
    id,
    kind,
    rev: 1,
    state: 'active' as const,
    hidden: false,
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    deletedAt: null,
    order,
    title,
  };
}

/* -------------------------------------------------------------------------- */
/* site                                                                        */
/* -------------------------------------------------------------------------- */

const site: SiteEntity = {
  ...base('site', 'qwb_site_v1', 10, 'Qortal Web Builders'),
  payload: {
    brand: {
      name: 'Qortal Web Builders',
      tagline: 'Custom websites and custom Qortal apps, built around your project.',
      since: 'since 2025',
    },
    logo: {
      source: 'bundled',
      src: logoFull,
      alt: 'Qortal Web Builders logo: the QWB emblem above the Qortal Web Builders wordmark',
    },
    mark: {
      source: 'bundled',
      src: iconMark,
      alt: 'Qortal Web Builders icon: the QWB hexagon',
    },
    nav: [
      { label: 'Services', href: '#services' },
      { label: 'Portfolio', href: '#portfolio' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Contact', href: '#contact' },
    ],
    hero: {
      heading: 'Custom websites and Qortal apps, built around your project',
      subtitle:
        'We design and build individually tailored websites and Qortal applications: visual identity, layout, functions and behaviour shaped around what your project actually needs.',
      primaryCta: { label: 'Request a free quote', href: QDN_QMAIL },
      secondaryCta: { label: 'See our portfolio', href: '#portfolio' },
    },
    sections: [
      { id: 'hero', label: 'Home', visible: true },
      { id: 'services', label: 'Services', visible: true },
      { id: 'portfolio', label: 'Portfolio', visible: true },
      { id: 'how-it-works', label: 'How It Works', visible: true },
      { id: 'pricing', label: 'Pricing & Quotes', visible: true },
      { id: 'contact', label: 'Contact', visible: true },
    ],
    contact: {
      heading: 'Contact',
      intro:
        'Send us a Q-Mail to request a free, no-obligation quote, or ask a question in the Qortal Web Builders group.',
      columns: [
        {
          title: 'Write to us',
          rows: [
            { label: 'Q-Mail', value: 'Open Q-Mail', href: QDN_QMAIL },
            { label: 'Group', value: 'Qortal Web Builders', href: QDN_GROUP },
          ],
        },
        {
          title: 'Community',
          rows: [
            { label: 'Group name', value: 'Qortal Web Builders', href: QDN_GROUP },
            { label: 'Group ID', value: '745', href: QDN_GROUP },
          ],
        },
      ],
    },
    footer: {
      credit: [
        {
          text: 'Hosted on the Qortal Data Network (QDN). This site does not use cookies. Built by ',
        },
        { text: 'Qortal Web Builders', href: QDN_SELF },
        { text: '.' },
      ],
      creditNote: 'Custom websites, custom Qortal apps and design work by Qortal Web Builders.',
    },
    meta: {
      title: 'QWB - Qortal Web Builders | Custom websites and Qortal apps',
      description:
        'Qortal Web Builders designs and builds custom websites and custom Qortal apps, shaped around each project’s visual and functional requirements. Request a free quote.',
    },
  },
};

/* -------------------------------------------------------------------------- */
/* services: exactly two offerings                                            */
/* -------------------------------------------------------------------------- */

const services: readonly ServiceEntity[] = [
  {
    ...base('service', seedId('service', 'custom-websites', 'b1'), 10, 'Custom Websites'),
    payload: {
      summary:
        'Static websites and Web2-to-Qortal recreations, designed for your project and published on the Qortal Data Network.',
      bullets: [
        'Static websites designed from scratch: layout, colours, typography and content',
        'Web2-to-Qortal recreations: an existing website rebuilt as a Qortal-hosted site',
        'Responsive layouts that work on phones, tablets and desktops',
        'Hosted on QDN, so no hosting account is needed',
      ],
      icon: '🌐',
      cta: { label: 'Request a quote', href: '#pricing' },
    },
  },
  {
    ...base('service', seedId('service', 'custom-qortal-apps', 'b2'), 20, 'Custom Qortal Apps'),
    payload: {
      summary:
        'QDN-hosted applications with the functions your project needs, from a focused tool to an app with owner-managed content.',
      bullets: [
        'Applications that read and publish QDN data through Qortal platform APIs',
        'Owner-only editing, so you can update texts, projects and articles yourself',
        'Integrations with Qortal features such as Q-Mail links and groups',
        'Built and tested for the Qortal host environment',
      ],
      icon: '🧩',
      cta: { label: 'Request a quote', href: '#pricing' },
    },
  },
];

/* -------------------------------------------------------------------------- */
/* how it works                                                               */
/* -------------------------------------------------------------------------- */

const steps: readonly StepEntity[] = [
  {
    ...base('step', seedId('step', 'tell-us', 'c1'), 10, 'Tell us about your project'),
    payload: {
      description:
        'Share your goal, your audience, the visual direction and the functions you need. We plan the work before any code is written.',
      illustration: {
        source: 'bundled',
        src: remoteDesignIllustration,
        alt: 'Illustration of a designer and a developer planning a website layout together',
      },
    },
  },
  {
    ...base('step', seedId('step', 'design-and-build', 'c2'), 20, 'We design and build'),
    payload: {
      description:
        'We build a first version you can review inside a Qortal host, then refine it with you until the result is right.',
      illustration: {
        source: 'bundled',
        src: redesignIllustration,
        alt: 'Illustration of a designer reviewing and reshaping a website layout',
      },
    },
  },
  {
    ...base('step', seedId('step', 'launch-and-handover', 'c3'), 30, 'Launch and handover'),
    payload: {
      description:
        'We run final checks and hand over the finished work, ready to be published under your own Qortal account.',
      illustration: {
        source: 'bundled',
        src: graduationIllustration,
        alt: 'Illustration of a finished project being handed over',
      },
    },
  },
];

/* -------------------------------------------------------------------------- */
/* works (portfolio): the owner's published list                              */
/* -------------------------------------------------------------------------- */

type WorkSeed = {
  readonly slug: string;
  readonly title: string;
  readonly categories: readonly string[];
  readonly href: string;
  readonly featured: boolean;
  readonly summary: string;
};

const workSeeds: readonly WorkSeed[] = [
  {
    slug: 'asot-a-state-of-trance',
    title: 'ASOT | A State Of Trance',
    categories: ['Custom website'],
    href: 'qortal://WEBSITE/ASOT%20-%20A%20State%20Of%20Trance',
    featured: true,
    summary: 'A custom website published on the Qortal Data Network.',
  },
  {
    slug: 'html-web-gallery',
    title: 'HTML web @ Qortal Web Builders',
    categories: ['Website', 'Template gallery'],
    href: QDN_TEMPLATE_GALLERY,
    featured: true,
    summary: 'Our HTML template gallery, published as a Qortal website.',
  },
  {
    slug: 'iffi-vaba-mees',
    title: 'iffi vaba mees',
    categories: ['Custom website'],
    href: 'qortal://WEBSITE/iffi%20vaba%20mees',
    featured: true,
    summary: 'A custom personal website published on the Qortal Data Network.',
  },
  {
    slug: 'qortal-suomi-finland',
    title: 'Qortal Suomi - Finland',
    categories: ['Content website'],
    href: 'qortal://WEBSITE/Suomi%20-%20Finland',
    featured: false,
    summary: 'A content website for the Qortal community in Finland.',
  },
  {
    slug: 'svik-kommuuni',
    title: 'SVIK | Suomen Vapaiden Ihmisten Kommuuni',
    categories: ['Content website'],
    href: 'qortal://WEBSITE/suomen%20vapaiden%20ihmisten%20kommuuni',
    featured: false,
    summary: 'A content website published on the Qortal Data Network.',
  },
  {
    slug: 'iffi-forest-life',
    title: 'iffi forest life',
    categories: ['Content website'],
    href: 'qortal://WEBSITE/iffi%20forest%20life',
    featured: false,
    summary: 'A content website published on the Qortal Data Network.',
  },
  {
    slug: 'eestlased-qortalis',
    title: 'Eestlased Qortalis',
    categories: ['Content website'],
    href: 'qortal://WEBSITE/Eestlased%20Qortalis',
    featured: false,
    summary: 'A content website for Estonians on Qortal.',
  },
  {
    slug: 'our-own-website',
    title: 'Of course our own website',
    categories: ['Custom website'],
    href: QDN_SELF,
    featured: false,
    summary: 'The Qortal Web Builders website itself, published on QDN.',
  },
];

const WORK_SLUG_RANDOM = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'] as const;

const works: readonly WorkEntity[] = workSeeds.map((seed, index) => ({
  ...base(
    'work',
    seedId('work', seed.slug, WORK_SLUG_RANDOM[index] ?? 'dx'),
    (index + 1) * 10,
    seed.title,
  ),
  payload: {
    slug: seed.slug,
    summary: seed.summary,
    description: [
      `${seed.title} is published on the Qortal Data Network as a live website. Open the live site to browse it in the Qortal host.`,
      'Every project starts from its own goal, audience and visual direction, so no two sites are the same.',
    ],
    categories: seed.categories,
    // Phase-1 placeholders: real screenshots are published by the owner as QDN media.
    images: [{ source: 'placeholder', label: seed.title, alt: `Preview of ${seed.title}` }],
    links: [{ label: 'Open the live website', href: seed.href }],
    featured: seed.featured,
  },
}));

/* -------------------------------------------------------------------------- */
/* pricing: per project, no specific figures                                  */
/* -------------------------------------------------------------------------- */

const prices: readonly PriceEntity[] = [
  {
    ...base('price', seedId('price', 'per-project-quote', 'e1'), 10, 'Pricing & quotes'),
    payload: {
      intro:
        'Every project is priced individually, because the scope of a website or a Qortal app varies widely. Tell us what you need and we will quote it.',
      lines: [
        {
          icon: '📐',
          text: 'The price follows the scope: number of pages, design depth and features.',
        },
        {
          icon: '🔗',
          text: 'Web2-to-Qortal recreations are priced by content and integration work.',
        },
        { icon: '🧩', text: 'Custom Qortal apps are priced by the functions they must perform.' },
        { icon: '🎁', text: 'The quote is free and carries no obligation.' },
      ],
      cta: { label: 'Request a free quote', href: QDN_QMAIL },
      note: 'Send us a Q-Mail or ask in the Qortal Web Builders group. We reply with a quote for your project.',
    },
  },
];

/* -------------------------------------------------------------------------- */
/* articles (posts)                                                           */
/* -------------------------------------------------------------------------- */

const articles: readonly ArticleEntity[] = [
  {
    ...base(
      'article',
      seedId('article', 'order-reception-and-planning', 'f1'),
      10,
      'How we build your website, step by step',
    ),
    payload: {
      slug: 'order-reception-and-planning',
      summary:
        'From your first message to the finished files: what happens after you get in touch, and what we need from you along the way.',
      heroImage: {
        source: 'bundled',
        src: remoteDesignIllustration,
        alt: 'Illustration of a designer and a developer planning a website layout together',
      },
      blocks: [
        {
          type: 'note',
          text: 'Here is an overview of the process from the first message to the finished, delivered website.',
        },
        {
          type: 'bullets',
          items: [
            [
              { text: 'You get in touch through ' },
              { text: 'Q-Mail', href: QDN_QMAIL },
              { text: ' and describe the website or app you want.' },
            ],
            [
              { text: 'Joining the ' },
              { text: 'Qortal Web Builders group (ID 745)', href: QDN_GROUP },
              { text: ' is optional and makes questions faster to answer.' },
            ],
            [
              {
                text: 'We build a first visual version and publish it to a test resource, so you see it in a real Qortal host rather than in a screenshot.',
              },
            ],
            [
              {
                text: 'You review it and tell us what to change. We adjust and show you the next version until the design is yours.',
              },
            ],
            [
              {
                text: 'When everything matches your plan, we do a final check and hand over the finished files, ready to publish under your own Qortal account.',
              },
            ],
          ],
        },
        {
          type: 'note',
          text: 'A short checklist helps you prepare in advance. The result improves when the thinking happens before the building.',
          action: {
            label: 'Read the preparation checklist',
            href: '#/post/what-information-do-we-want-first',
          },
        },
      ],
      tags: ['process', 'getting started'],
    },
  },
  {
    ...base(
      'article',
      seedId('article', 'why-do-you-need-your-own-website', 'f2'),
      20,
      'Why do you need your own website?',
    ),
    payload: {
      slug: 'why-do-you-need-your-own-website',
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
          text: 'A website is your digital business card: a place where the important information is presented quickly and clearly, without making visitors search for it.',
        },
        { type: 'heading', text: 'But isn’t social media or a blog enough?' },
        {
          type: 'paragraph',
          text: 'Social pages and blogs are valuable, but a visitor who wants a quick introduction often has to follow several links and read long texts before understanding what you do.',
        },
        {
          type: 'bullets',
          items: [
            [{ text: 'Your information is scattered across several places.' }],
            [{ text: 'Long texts take time, and most visitors do not have that time.' }],
            [{ text: 'A ready-made profile cannot show your project the way you intend.' }],
          ],
        },
        { type: 'heading', text: 'That is where a website comes in.' },
        {
          type: 'paragraph',
          text: 'With one well-structured website you present everything essential at a glance, hosted on the Qortal Data Network without a hosting provider in between.',
        },
        {
          type: 'note',
          text: 'Want your project to be clearly represented? Tell us what it needs and we will quote it.',
          action: { label: 'Request a free quote via Q-Mail', href: QDN_QMAIL },
        },
      ],
      tags: ['positioning', 'qdn hosting'],
    },
  },
  {
    ...base('article', seedId('article', 'valuing-your-time', 'f3'), 30, 'Valuing your time'),
    payload: {
      slug: 'valuing-your-time',
      summary:
        'What you gain when you commission a custom website: planning, design decisions made once, and tooling that keeps the work short.',
      heroImage: {
        source: 'bundled',
        src: redesignIllustration,
        alt: 'Illustration of a designer reviewing and reshaping a website layout',
      },
      blocks: [
        { type: 'heading', text: 'How we help you value your time' },
        {
          type: 'bullets',
          items: [
            [
              {
                text: 'We plan before we build, so the important decisions are made once instead of twice.',
              },
            ],
            [
              {
                text: 'We look for the solution that suits your case, not the one we sell most often.',
              },
            ],
            [
              {
                text: 'We bring the right tools to the work: layout, code, illustration and Qortal know-how.',
              },
            ],
          ],
        },
        {
          type: 'note',
          text: 'Need a website or an app for your project? Look at what we have built so far, then tell us what yours has to do.',
          action: { label: 'See our portfolio', href: '#/works' },
        },
      ],
      tags: ['process', 'custom design'],
    },
  },
  {
    ...base(
      'article',
      seedId('article', 'what-information-do-we-want-first', 'f4'),
      40,
      'What information do we want first?',
    ),
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
          type: 'bullets',
          items: [
            [{ text: 'The display name for the site, if it should differ from your Qortal name.' }],
            [{ text: 'A slogan or tagline, if you have one.' }],
            [{ text: 'Whether it is a single-page site, a multi-page site, or a Qortal app.' }],
            [{ text: 'Who the site is aimed at and what its purpose is.' }],
            [
              {
                text: 'The initial texts you want on the site, and any existing website to recreate.',
              },
            ],
            [{ text: 'What the design should feel like, and any examples you like.' }],
            [{ text: 'Whether you need a logo, banner or other graphic elements.' }],
          ],
        },
        {
          type: 'note',
          text: 'Nothing has to be perfect from the start. The result takes shape step by step.',
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
  services,
  steps,
  works,
  prices,
  articles,
};
