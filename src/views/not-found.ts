import type { ContentBundle } from '../content/schema';
import { escapeHtml } from '../ui/html';
import type { View } from './types';
import { interpolate, siteUi } from '../content/site-ui';

/** Unknown hash route. A `WEBSITE` QDN resource has no index-fallback routing,
    so an unknown route has to be handled in the app. */
export function createNotFoundView(content: ContentBundle, hash: string): View {
  const { site } = content;
  const ui = siteUi(site);

  return {
    title: `${ui.notFoundTitle} | ${site.title}`,
    description: ui.notFoundMessage,
    html: `      <main id="main-content">
        <header class="site-header">
          <div class="container">
            <div class="row justify-content-center">
              <div class="col-lg-8 col-12">
                <nav aria-label="breadcrumb">
                  <ol class="breadcrumb">
                    <li class="breadcrumb-item"><a href="#/">${escapeHtml(ui.homeLabel)}</a></li>
                    <li class="breadcrumb-item active" aria-current="page">${escapeHtml(ui.notFoundTitle)}</li>
                  </ol>
                </nav>
                <h1 class="page-title">${escapeHtml(ui.notFoundHeading)}</h1>
              </div>
            </div>
          </div>
        </header>
        <section class="section-padding">
          <div class="container">
            <div class="row">
              <div class="col-lg-8 col-12 m-auto">
                <p>${escapeHtml(interpolate(ui.notFoundMessage, { path: `#${hash}` }))}</p>
                <p class="mb-0">
                  <a class="btn custom-btn mt-2" href="#/">${escapeHtml(ui.backHome)}</a>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>`,
  };
}
