import type { WorkEntity } from '../content/schema';
import { workHash } from '../router';
import { escapeHtml } from '../ui/html';
import { richContent } from '../owner/rich-text';
import { renderImage } from '../ui/image';

export interface WorkCardOptions {
  readonly columnClass?: string;
  readonly buttonLabel?: string;
}

/**
 * Project card: cover image, category line, title and summary. The title link is
 * stretched over the card; the button is a second, independent link to the same
 * project page (`#/work/<slug>`), so both work with the keyboard.
 */
export function renderWorkCard(work: WorkEntity, options: WorkCardOptions = {}): string {
  const columnClass = options.columnClass ?? 'col-lg-4 col-md-6 col-12 mb-4';
  const { slug, summary, categories, images } = work.payload;
  const href = workHash(slug);
  const cover = images[0];

  return `              <div class="${columnClass}">
                <article class="custom-block bg-white shadow-lg work-card" data-owner-collection="works" data-owner-id="${escapeHtml(work.id)}">
                  ${cover === undefined ? '' : renderImage(cover, { className: 'custom-block-image img-fluid' })}
                  <p class="card-meta mb-1">${escapeHtml(categories.join(' · '))}</p>
                  <h3 class="card-title mb-2"><a class="card-link" href="${escapeHtml(href)}">${escapeHtml(work.title)}</a></h3>
                  <div class="card-meta mb-0 rich-content">${richContent(work, 'summary', summary)}</div>
                  <a class="btn custom-btn mt-3 card-cta" href="${escapeHtml(href)}">${escapeHtml(options.buttonLabel ?? 'View project')}</a>
                </article>
              </div>`;
}

export function renderWorksGrid(works: readonly WorkEntity[], buttonLabel?: string): string {
  return works.map((work) => renderWorkCard(work, { ...(buttonLabel ? { buttonLabel } : {}) })).join('\n');
}
