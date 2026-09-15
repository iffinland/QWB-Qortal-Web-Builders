import type { ImageRef, LinkRef } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { renderImage } from '../ui/image';

export interface BreadcrumbEntry {
  readonly label: string;
  readonly href?: string;
}

export interface PageHeaderOptions {
  readonly breadcrumbs: readonly BreadcrumbEntry[];
  readonly heading: string;
  readonly cover?: ImageRef;
  readonly note?: string;
  readonly cta?: LinkRef;
}

/**
 * Gradient page-header band of the inner pages: breadcrumb, white headline and
 * an optional illustration card in a white rounded block, followed by the
 * published `<hr>` note + centred pill CTA row.
 *
 * Heading hierarchy fix: the published pages used `<h2>` as the page headline
 * (no `<h1>` anywhere). This renders the page headline as `<h1 class="page-title">`
 * sized by the theme at the published 46/36/28 px scale.
 */
export function renderPageHeader(options: PageHeaderOptions): string {
  const breadcrumbs = options.breadcrumbs
    .map((entry) => {
      if (entry.href === undefined) {
        return `                  <li class="breadcrumb-item active" aria-current="page">${escapeHtml(entry.label)}</li>`;
      }
      return `                  <li class="breadcrumb-item"><a href="${escapeHtml(entry.href)}">${escapeHtml(entry.label)}</a></li>`;
    })
    .join('\n');

  const cover =
    options.cover === undefined
      ? ''
      : `
              <div class="col-lg-5 col-12">
                <div class="topics-detail-block bg-white shadow-lg">
                  ${renderImage(options.cover, {
                    className: 'topics-detail-block-image img-fluid',
                  })}
                </div>
              </div>`;

  const note =
    options.note === undefined
      ? ''
      : `
            <hr class="header-divider">
            <p class="site-header-note">${escapeHtml(options.note)}</p>`;

  const cta =
    options.cta === undefined
      ? ''
      : `
            <div class="card-cta-row">
              <a class="btn custom-btn mt-2 mt-lg-3" href="${escapeHtml(options.cta.href)}">${escapeHtml(options.cta.label)}</a>
            </div>`;

  return `        <header class="site-header">
          <div class="container">
            <div class="row justify-content-center align-items-center">
              <div class="col-lg-5 col-12 mb-5 mb-lg-0">
                <nav aria-label="breadcrumb">
                  <ol class="breadcrumb">
${breadcrumbs}
                  </ol>
                </nav>
                <h1 class="page-title">${escapeHtml(options.heading)}</h1>
              </div>${cover}
            </div>${note}${cta}
          </div>
        </header>`;
}
