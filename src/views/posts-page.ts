import type { ContentBundle } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { richContent } from '../owner/rich-text';
import { renderImage } from '../ui/image';
import { renderPageHeader } from './page-header';
import type { View } from './types';
import { siteUi } from '../content/site-ui';

/**
 * Article index. The published site had no listing page (its out-of-golden-
 * master topic-listing template was never part of the site); the approved
 * architecture expects an index for "+ New article" in Phase 2, so the retained
 * article kind gets the same card vocabulary as the portfolio grid.
 */
export function createPostsView(content: ContentBundle): View {
  const { site, articles } = content;
  const first = articles[0];
  const ui = siteUi(site);

  const cards = articles
    .map(
      (article) => `              <div class="col-lg-4 col-md-6 col-12 mb-4 mb-lg-3">
                <article class="custom-block bg-white shadow-lg" data-owner-collection="articles" data-owner-id="${escapeHtml(article.id)}">
                  <h5 class="card-title mb-2"><a class="card-link" href="#/post/${escapeHtml(article.payload.slug)}">${escapeHtml(article.title)}</a></h5>
                  <div class="card-meta mb-0 rich-content">${richContent(article, 'summary', article.payload.summary)}</div>
                  ${renderImage(article.payload.heroImage, { className: 'custom-block-image img-fluid' })}
                  <a class="btn custom-btn mt-2 mt-lg-3 card-cta" href="#/post/${escapeHtml(article.payload.slug)}">${escapeHtml(ui.readMore)}</a>
                </article>
              </div>`,
    )
    .join('\n');

  return {
    title: `${ui.articlesLabel} | ${site.title}`,
    description: ui.postsDescription,
    html: `      <main id="main-content">
${renderPageHeader({
  breadcrumbs: [{ label: ui.homeLabel, href: '#/' }, { label: ui.articlesLabel }],
  heading: ui.postsHeading,
  ...(first === undefined ? {} : { cover: first.payload.heroImage }),
  note: ui.postsNote,
})}
        <section class="posts-section section-padding">
          <div class="container">
            <div class="row">
${cards}
            </div>
          </div>
        </section>
      </main>`,
  };
}
