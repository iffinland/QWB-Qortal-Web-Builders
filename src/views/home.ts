import type { ContentBundle, LinkRef, SiteEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { renderContact } from './contact';
import { renderHero } from './hero';
import { renderHighlights } from './highlights';
import { renderPricing } from './pricing';
import { renderServicesBlock } from './services';
import { renderSteps } from './steps';
import { renderWorkCard } from './works';
import { featuredWorks } from '../content/repository';
import type { View } from './types';

function sectionLabel(site: SiteEntity, id: string): string {
  return site.payload.sections.find((section) => section.id === id)?.label ?? '';
}

function sectionCta(site: SiteEntity, id: string): LinkRef | undefined {
  return site.payload.sections.find((section) => section.id === id)?.cta;
}

function sectionVisible(site: SiteEntity, id: string): boolean {
  return site.payload.sections.find((section) => section.id === id)?.visible ?? false;
}

/**
 * Home page: hero → featured pair → tabbed "Browse Topics" → pricing →
 * contact → footer. Section order and visibility come from `site.sections`,
 * so Phase 2 can reorder or hide a section without touching the renderer.
 */
export function createHomeView(content: ContentBundle): View {
  const { site, highlights, prices } = content;
  const tabs = site.payload.tabs;
  const featured = featuredWorks(content);

  const hero = sectionVisible(site, 'section_1') ? renderHero(site) : '';

  const highlightsSection = sectionVisible(site, 'section_featured')
    ? renderHighlights(highlights)
    : '';

  const explore =
    sectionVisible(site, 'section_2') && tabs.length > 0
      ? renderExploreSection(site, tabs, featured, content)
      : '';

  const pricing = sectionVisible(site, 'section_3')
    ? renderPricing(prices, sectionLabel(site, 'section_3'))
    : '';

  const contact = sectionVisible(site, 'section_5') ? renderContact(site) : '';

  return {
    title: site.payload.meta.title,
    description: site.payload.meta.description,
    html: `      <main id="main-content">
${[hero, highlightsSection, explore, pricing, contact].filter((part) => part !== '').join('\n')}
      </main>`,
    mount(root) {
      const panes = root.querySelectorAll<HTMLElement>('[data-tabs]');
      panes.forEach((pane) => mountTabStrip(pane));
    },
  };
}

function renderExploreSection(
  site: SiteEntity,
  tabs: SiteEntity['payload']['tabs'],
  featured: ContentBundle['works'],
  content: ContentBundle,
): string {
  const tabButtons = tabs
    .map((tab, index) => {
      const selected = index === 0;
      const id = `tab-${index + 1}`;
      return `                    <li class="nav-item" role="presentation">
                      <button class="nav-link${selected ? ' active' : ''}" id="${id}" type="button" role="tab" data-tab-target="panel-${index + 1}" aria-controls="panel-${index + 1}" aria-selected="${selected ? 'true' : 'false'}"${selected ? '' : ' tabindex="-1"'}>${escapeHtml(tab.label)}</button>
                    </li>`;
    })
    .join('\n');

  const featuredCards = featured
    .map((work) => renderWorkCard(work, { columnClass: 'col-lg-4 col-md-6 col-12 mb-4 mb-lg-3' }))
    .join('\n');

  const panels = [
    `                  <div class="tab-pane fade show active" id="panel-1" role="tabpanel" aria-labelledby="tab-1" tabindex="0">
                    <div class="row">
${renderSteps(content.steps)}
                    </div>
                  </div>`,
    `                  <div class="tab-pane fade" id="panel-2" role="tabpanel" aria-labelledby="tab-2" tabindex="0">
                    <div class="center">
                      <p class="stat-pill statcompleted"><span>Completed websites - ${content.works.length}</span></p>
                    </div>
                    <div class="row mt-4">
${featuredCards}
                    </div>
                    <div class="card-cta-row">
                      <a class="btn custom-btn mt-3" href="#/works">VIEW ALL OUR COMPLETED WORKS</a>
                    </div>
                  </div>`,
    `                  <div class="tab-pane fade" id="panel-3" role="tabpanel" aria-labelledby="tab-3" tabindex="0">
                    <div class="row">
${renderServicesBlock(content.services, site, sectionCta(site, 'section_2'))}
                    </div>
                  </div>`,
  ].join('\n');

  return `        <section class="explore-section section-padding" id="section_2">
          <div class="container">
            <div class="row">
              <div class="col-12 text-center">
                <h2 class="mb-4">${escapeHtml(sectionLabel(site, 'section_2'))}</h2>
              </div>
            </div>
          </div>

          <div class="container" data-tabs>
            <div class="row">
              <ul class="nav nav-tabs" role="tablist" aria-label="${escapeHtml(sectionLabel(site, 'section_2'))}">
${tabButtons}
              </ul>
            </div>
            <div class="row">
              <div class="col-12">
                <div class="tab-content">
${panels}
                </div>
              </div>
            </div>
          </div>
        </section>`;
}

/** Native tab strip: click plus Home/End/arrow keys, ARIA state maintained. */
function mountTabStrip(root: HTMLElement): void {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  if (tabs.length === 0) return;

  const select = (index: number): void => {
    tabs.forEach((tab, position) => {
      const isSelected = position === index;
      tab.classList.toggle('active', isSelected);
      tab.setAttribute('aria-selected', String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      const panelId = tab.dataset.tabTarget;
      if (panelId === undefined) return;
      const panel = root.querySelector<HTMLElement>(`#${panelId}`);
      if (panel === null) return;
      panel.classList.toggle('show', isSelected);
      panel.classList.toggle('active', isSelected);
    });
  };

  const targetFor = (key: string, index: number): number | null => {
    switch (key) {
      case 'ArrowRight':
        return (index + 1) % tabs.length;
      case 'ArrowLeft':
        return (index - 1 + tabs.length) % tabs.length;
      case 'Home':
        return 0;
      case 'End':
        return tabs.length - 1;
      default:
        return null;
    }
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', (event) => {
      const next = targetFor(event.key, index);
      if (next === null) return;
      event.preventDefault();
      tabs[next]?.focus();
      select(next);
    });
  });
}
