import type { ContentBundle } from '../content/schema';
import { escapeHtml } from '../ui/html';
import type { View } from './types';

/** Unknown hash route. A `WEBSITE` QDN resource has no index-fallback routing,
    so an unknown route has to be handled in the app. */
export function createNotFoundView(content: ContentBundle, hash: string): View {
  const { site } = content;

  return {
    title: `Page not found | ${site.title}`,
    description: 'That address does not exist on this site.',
    html: `      <main id="main-content">
        <header class="site-header">
          <div class="container">
            <div class="row justify-content-center">
              <div class="col-lg-8 col-12">
                <nav aria-label="breadcrumb">
                  <ol class="breadcrumb">
                    <li class="breadcrumb-item"><a href="#/">Homepage</a></li>
                    <li class="breadcrumb-item active" aria-current="page">Not found</li>
                  </ol>
                </nav>
                <h1 class="page-title">This page is not here</h1>
              </div>
            </div>
          </div>
        </header>
        <section class="section-padding">
          <div class="container">
            <div class="row">
              <div class="col-lg-8 col-12 m-auto">
                <p>No view matches <code>#${escapeHtml(hash)}</code>.</p>
                <p class="mb-0">
                  <a class="btn custom-btn mt-2" href="#/">Back to the front page</a>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>`,
  };
}
