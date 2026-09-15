import { describe, expect, it } from 'vitest';

import { seedBundle } from '../src/content/seed';
import { createSeedSource } from '../src/content/repository';
import { renderInline } from '../src/ui/html';
import { renderImage } from '../src/ui/image';
import { createHomeView } from '../src/views/home';
import { createWorksView } from '../src/views/works-page';
import { createPostView } from '../src/views/post-page';
import { createNotFoundView } from '../src/views/not-found';
import { renderNavbar } from '../src/views/navbar';
import type { ContentBundle } from '../src/content/schema';
import { parseRoute } from '../src/router';

async function loadContent(): Promise<ContentBundle> {
  const result = await createSeedSource().load();
  if (result.status === 'error') throw new Error('seed content is invalid');
  return result.bundle;
}

describe('inline rendering', () => {
  it('escapes text and only links safe hrefs', () => {
    const html = renderInline([
      { text: 'Contact us via ' },
      { text: 'Q-Mail', href: 'qortal://APP/Q-Mail/to/Qortal20Web%20Builders' },
      { text: ' or ' },
      { text: 'this dead link', href: 'https://qortal.org' },
      { text: ' <script>' },
    ]);

    expect(html).toContain('<a href="qortal://APP/Q-Mail/to/Qortal20Web%20Builders">Q-Mail</a>');
    expect(html).not.toContain('<a href="https://');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes alt text and keeps the published eager loading', () => {
    const html = renderImage({ source: 'bundled', src: '/a.png', alt: 'a "quote"' });
    expect(html).toContain('alt="a &quot;quote&quot;"');
    expect(html).not.toContain('loading="lazy"');
  });
});

describe('home view', () => {
  it('renders the home sections in the published order', async () => {
    const content = await loadContent();
    const html = createHomeView(content).html;

    const order = [
      'id="section_1"',
      'id="section_featured"',
      'id="section_2"',
      'id="section_3"',
      'id="section_5"',
    ];
    let previous = -1;
    for (const marker of order) {
      const position = html.indexOf(marker);
      expect(position, `${marker} should be present`).toBeGreaterThan(-1);
      expect(position, `${marker} should follow the previous section`).toBeGreaterThan(previous);
      previous = position;
    }
  });

  it('honours section visibility and excludes tombstoned works', async () => {
    const content = await loadContent();
    const hidden: ContentBundle = {
      ...content,
      site: {
        ...content.site,
        payload: {
          ...content.site.payload,
          sections: content.site.payload.sections.map((section) =>
            section.id === 'section_3' ? { ...section, visible: false } : section,
          ),
        },
      },
    };

    expect(createHomeView(hidden).html).not.toContain('id="section_3"');
    expect(createHomeView(content).html).toContain('id="section_3"');
  });

  it('describes the portfolio count and keeps one QDN target per work card', async () => {
    const content = await loadContent();
    const html = createHomeView(content).html;
    expect(html).toContain(`Completed websites - ${content.works.length}`);
    expect(html).toContain('href="qortal://WEBSITE/ASOT%20-%20A%20State%20Of%20Trance"');
    expect(html).toContain('href="#/works"');
  });

  it('switches tab panels on click, keeping ARIA state in sync', async () => {
    const content = await loadContent();
    const view = createHomeView(content);

    const root = document.createElement('div');
    root.innerHTML = view.html;
    document.body.append(root);
    view.mount?.(root, { content });

    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const panels = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    expect(tabs).toHaveLength(3);
    expect(panels).toHaveLength(3);
    expect(panels[0]?.classList.contains('active')).toBe(true);

    tabs[1]?.click();

    expect(panels[1]?.classList.contains('active')).toBe(true);
    expect(panels[0]?.classList.contains('active')).toBe(false);
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false');
    expect(tabs[0]?.tabIndex).toBe(-1);
    root.remove();
  });

  it('supports Home and End on the tab strip', async () => {
    const content = await loadContent();
    const view = createHomeView(content);

    const root = document.createElement('div');
    root.innerHTML = view.html;
    document.body.append(root);
    view.mount?.(root, { content });

    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const panels = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(panels[2]?.classList.contains('active')).toBe(true);

    tabs[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(panels[0]?.classList.contains('active')).toBe(true);
    root.remove();
  });

  it('takes the pane CTA from editable site content, not from code', async () => {
    const content = await loadContent();
    const pane = createHomeView(content).html;
    const cta = content.site.payload.sections.find((section) => section.id === 'section_2')?.cta;
    expect(cta).toBeDefined();
    expect(pane).toContain(`>${cta?.label}</a>`);
    expect(pane).toContain(`href="${cta?.href}"`);

    const withoutCta: ContentBundle = {
      ...content,
      site: {
        ...content.site,
        payload: {
          ...content.site.payload,
          sections: content.site.payload.sections.map((section) =>
            section.id === 'section_2'
              ? { id: section.id, label: section.label, visible: section.visible }
              : section,
          ),
        },
      },
    };
    expect(createHomeView(withoutCta).html).not.toContain(`>${cta?.label}</a>`);
  });
});

describe('navbar', () => {
  it('renders the four published links with no duplicated empty item', () => {
    const html = renderNavbar(seedBundle.site, '');
    expect((html.match(/class="nav-item"/g) ?? []).length).toBe(4);
    for (const label of ['Home', 'Browse Topics', 'Prices', 'Contact']) {
      expect(html).toContain(`>${label}</a>`);
    }
    expect(html).toContain('aria-controls="navbarNav"');
  });
});

describe('inner views', () => {
  it('renders one card per work with its QDN link', async () => {
    const content = await loadContent();
    const html = createWorksView(content).html;
    for (const work of content.works) {
      expect(html).toContain(work.title);
      expect(html).toContain(work.payload.links[0]!.href);
    }
  });

  it('renders an article with escaped content and no injected markup', async () => {
    const content = await loadContent();
    const article = content.articles[0]!;
    const html = createPostView(content, article).html;
    expect(html).toContain('class="topics-detail-block bg-white shadow-lg"');
    expect(html).toContain('article-note');
    expect(html).toContain('qortal://use-group/action-join/groupid-745');
  });

  it('renders a not-found view for an unknown hash', async () => {
    const content = await loadContent();
    const html = createNotFoundView(content, '/nope').html;
    expect(html).toContain('This page is not here');
    expect(parseRoute('#/nope').kind).toBe('not-found');
  });
});
