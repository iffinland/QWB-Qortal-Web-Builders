import { describe, expect, it } from 'vitest';

import { seedBundle } from '../src/content/seed';
import { createSeedSource } from '../src/content/repository';
import type { ContentBundle } from '../src/content/schema';
import { renderInline } from '../src/ui/html';
import { renderImage } from '../src/ui/image';
import { createHomeView } from '../src/views/home';
import { createWorkView } from '../src/views/work-page';
import { createWorksView } from '../src/views/works-page';
import { createNotFoundView } from '../src/views/not-found';
import { renderNavbar } from '../src/views/navbar';
import { renderFooter } from '../src/views/footer';
import { renderPricing } from '../src/views/pricing';
import { renderOwnerConsole } from '../src/owner/console';

async function loadContent(): Promise<ContentBundle> {
  const result = await createSeedSource().load();
  return result.bundle;
}

function sectionIds(html: string): string[] {
  return [...html.matchAll(/<section[^>]* id="([^"]+)"/g)].map((match) => match[1] ?? '');
}

describe('inline rendering', () => {
  it('escapes text and only links safe hrefs', () => {
    const html = renderInline([
      { text: 'Contact via ' },
      { text: 'Q-Mail', href: 'qortal://APP/Q-Mail/to/Qortal20Web%20Builders' },
      { text: ' or ' },
      { text: 'a dead link', href: 'https://qortal.org' },
      { text: ' <script>' },
    ]);
    expect(html).toContain('<a href="qortal://APP/Q-Mail/to/Qortal20Web%20Builders">Q-Mail</a>');
    expect(html).not.toContain('<a href="https://');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes alt text and keeps eager loading', () => {
    const html = renderImage({ source: 'bundled', src: '/a.png', alt: 'a "quote"' });
    expect(html).toContain('alt="a &quot;quote&quot;"');
    expect(html).not.toContain('loading="lazy"');
  });
});

describe('one-page home', () => {
  it('renders exactly the six sections in the approved order', async () => {
    const html = createHomeView(await loadContent()).html;
    expect(sectionIds(html)).toEqual([
      'hero',
      'services',
      'portfolio',
      'how-it-works',
      'pricing',
      'contact',
    ]);
  });

  it('has no tabs, no highlight pair and no legacy topic copy', async () => {
    const html = createHomeView(await loadContent()).html;
    expect(html).not.toContain('nav-tabs');
    expect(html).not.toContain('tab-pane');
    expect(html).not.toContain('featured-section');
    expect(html).not.toContain('Browse Topics');
    expect(html).not.toContain('QWBT-1');
  });

  it('shows exactly the two services with their names', async () => {
    const html = createHomeView(await loadContent()).html;
    expect(html).toContain('Custom Websites');
    expect(html).toContain('Custom Qortal Apps');
  });

  it('hides a section the owner switched off', async () => {
    const content = await loadContent();
    const sections = content.site.payload.sections.map((section) =>
      section.id === 'pricing' ? { ...section, visible: false } : section,
    );
    const html = createHomeView({
      ...content,
      site: { ...content.site, payload: { ...content.site.payload, sections } },
    }).html;
    expect(sectionIds(html)).not.toContain('pricing');
  });

  it('features projects on the home page and links each to its project page', async () => {
    const html = createHomeView(await loadContent()).html;
    expect(html).toContain('href="#/work/asot-a-state-of-trance"');
    expect(html).toContain('href="#/works"');
  });

  it('has the logo with alt text in the hero and navigation', async () => {
    const content = await loadContent();
    const html = createHomeView(content).html;
    expect(html).toContain('brand-logo-image');
    const nav = renderNavbar(content.site, '#services');
    expect(nav).toContain('aria-current="true"');
    expect(nav).toContain('alt="Qortal Web Builders logo');
  });
});

describe('pricing and quotes', () => {
  it('states that pricing is per project and contains no figures', async () => {
    const content = await loadContent();
    const html = renderPricing(content.prices, 'Pricing & Quotes');
    expect(html).toContain('Pricing &amp; Quotes');
    expect(html).toContain('Request a free quote');
    expect(html).not.toMatch(/\d+\s*(QORT|EUR|USD|€|\$)/i);
  });

  it('falls back to a contact link when no pricing entity is published', () => {
    const html = renderPricing([], 'Pricing & Quotes');
    expect(html).toContain('href="#contact"');
  });
});

describe('project pages', () => {
  it('renders title, categories, every image, the links and a back link', async () => {
    const content = await loadContent();
    const work = content.works[0]!;
    const view = createWorkView(content, work);
    expect(view.title).toContain(work.title);
    expect(view.html).toContain(`<h1 class="page-title">${work.title}</h1>`);
    expect(view.html).toContain('aria-label="Categories"');
    expect(view.html).toContain('work-gallery');
    expect(view.html).toContain(`alt="Preview of ${work.title}"`);
    expect(view.html).toContain(work.payload.links[0]?.href ?? '');
    expect(view.html).toContain('href="#/works"');
  });

  it('renders an optional video with an accessible name and a download fallback', async () => {
    const content = await loadContent();
    const work = {
      ...content.works[0]!,
      payload: {
        ...content.works[0]!.payload,
        video: {
          name: 'Qortal Web Builders',
          identifier: 'qwb_work_demo-1',
          filename: 'demo.mp4',
          title: 'Demo tour',
        },
      },
    };
    const html = createWorkView(content, work).html;
    expect(html).toContain('<video');
    expect(html).toContain('aria-label="Demo tour"');
    expect(html).toContain('/arbitrary/VIDEO/Qortal%20Web%20Builders/qwb_work_demo-1');
    expect(html).not.toContain('/qwb_work_demo-1/demo.mp4');
  });

  it('lists every project in the portfolio view', async () => {
    const content = await loadContent();
    const html = createWorksView(content).html;
    expect(html.match(/class="card-link"/g)?.length).toBe(content.works.length);
  });
});

describe('not-found and navbar', () => {
  it('renders a not-found view for an unknown route', () => {
    const html = createNotFoundView(seedBundle, '/nope').html;
    expect(html).toContain('This page is not here');
    expect(html).toContain('#/nope');
  });

  it('renders footer links to the one-page sections and the articles', async () => {
    const content = await loadContent();
    const footer = renderFooter(content.site);
    expect(footer).toContain('href="#pricing"');
    expect(footer).toContain('href="#/posts"');
  });
});

describe('owner console markup', () => {
  it('lists every collection with its edit controls and the hidden badge', async () => {
    const content = await loadContent();
    const raw = { ...content, works: [{ ...seedBundle.works[0]!, hidden: true }] };
    const html = renderOwnerConsole(raw, {
      status: 'owner',
      name: 'owner-name',
      address: 'QTESTADDRESS',
    });
    expect(html).toContain('Owner tools');
    expect(html).toContain('data-action="toggle-hidden"');
    expect(html).toContain('hidden from visitors');
    expect(html).toContain('Portfolio projects');
  });
});
