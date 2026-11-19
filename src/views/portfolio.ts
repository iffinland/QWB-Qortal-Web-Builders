import type { WorkEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { renderWorkCard } from './works';

/**
 * Portfolio on the homepage: the featured projects, and a link to the full list.
 * Each card opens its own project page; nothing here is a tab or a carousel.
 */
export function renderPortfolio(
  featured: readonly WorkEntity[],
  totalCount: number,
  heading: string,
): string {
  const cards =
    featured.length === 0
      ? '              <p class="col-12">Our projects will appear here.</p>'
      : featured.map((work) => renderWorkCard(work)).join('\n');

  const allLink =
    totalCount === 0
      ? ''
      : `
            <div class="card-cta-row mt-2">
              <a class="btn custom-btn" href="#/works">View all ${totalCount} projects</a>
            </div>`;

  return `        <section class="portfolio-section section-padding" id="portfolio" aria-labelledby="portfolio-heading">
          <div class="container">
            <h2 id="portfolio-heading" class="section-title">${escapeHtml(heading)}</h2>
            <p class="section-intro">Selected projects, each published on the Qortal Data Network.</p>
            <div class="row">
${cards}
            </div>${allLink}
          </div>
        </section>`;
}
