import type { WorkEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { renderImage } from '../ui/image';

export interface WorkCardOptions {
  readonly columnClass?: string;
}

/** Portfolio card: title, build-kind line, 200 px cropped cover, pill CTA. */
export function renderWorkCard(work: WorkEntity, options: WorkCardOptions = {}): string {
  const columnClass = options.columnClass ?? 'col-lg-4 col-md-6 col-12 mb-4 mb-lg-3';
  const primaryLink = work.payload.links[0];
  const href = primaryLink?.href ?? '#/works';
  const ctaLabel = primaryLink?.label ?? 'Watch live website';

  return `              <div class="${columnClass}">
                <article class="custom-block bg-white shadow-lg">
                  <div class="d-flex">
                    <div>
                      <h5 class="card-title mb-2"><a class="card-link" href="${escapeHtml(href)}">${escapeHtml(work.title)}</a></h5>
                      <p class="card-meta mb-0">${escapeHtml(work.payload.buildKind)}</p>
                    </div>
                  </div>
                  ${renderImage(work.payload.cover, { className: 'custom-block-image img-fluid' })}
                  <a class="btn custom-btn mt-2 mt-lg-3 card-cta" href="${escapeHtml(href)}">${escapeHtml(ctaLabel)}</a>
                </article>
              </div>`;
}

export function renderWorksGrid(works: readonly WorkEntity[]): string {
  return works.map((work) => renderWorkCard(work)).join('\n');
}
