import type { WorkEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { renderWorkCard } from './works';
import type { SiteEntity } from '../content/schema';
import { interpolate, siteUi } from '../content/site-ui';

/**
 * Portfolio on the homepage: the featured projects, and a link to the full list.
 * Each card opens its own project page; nothing here is a tab or a carousel.
 */
export function renderPortfolio(
  featured: readonly WorkEntity[],
  totalCount: number,
  heading: string,
  site: SiteEntity,
): string {
  const ui = siteUi(site);
  const cards =
    featured.length === 0
      ? `              <p class="col-12">${escapeHtml(ui.portfolioEmpty)}</p>`
      : featured.map((work) => renderWorkCard(work, { buttonLabel: ui.viewProject })).join('\n');

  const allLink =
    totalCount === 0
      ? ''
      : `
            <div class="card-cta-row mt-2">
              <a class="btn custom-btn" href="#/works">${escapeHtml(interpolate(ui.viewAllProjects, { count: totalCount }))}</a>
            </div>`;

  return `        <section class="portfolio-section section-padding" id="portfolio" aria-labelledby="portfolio-heading">
          <div class="container">
            <h2 id="portfolio-heading" class="section-title">${escapeHtml(heading)}</h2>
            <p class="section-intro">${escapeHtml(ui.portfolioIntro)}</p>
            <div class="row">
${cards}
            </div>${allLink}
          </div>
        </section>`;
}
