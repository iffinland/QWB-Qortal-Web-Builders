import type { ContentBundle } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { renderImage } from '../ui/image';
import { renderPageHeader } from './page-header';
import type { View } from './types';

/**
 * Article index. The published site had no listing page (its out-of-golden-
 * master topic-listing template was never part of the site); the approved
 * architecture expects an index for "+ New article" in Phase 2, so the retained
 * article kind gets the same card vocabulary as the portfolio grid.
 */
export function createPostsView(content: ContentBundle): View {
  const { site, articles } = content;
  const first = articles[0];

  const cards = articles
    .map(
      (article) => `              <div class="col-lg-4 col-md-6 col-12 mb-4 mb-lg-3">
                <article class="custom-block bg-white shadow-lg">
                  <h5 class="card-title mb-2"><a class="card-link" href="#/post/${escapeHtml(article.payload.slug)}">${escapeHtml(article.title)}</a></h5>
                  <p class="card-meta mb-0">${escapeHtml(article.payload.summary)}</p>
                  ${renderImage(article.payload.heroImage, { className: 'custom-block-image img-fluid' })}
                  <a class="btn custom-btn mt-2 mt-lg-3 card-cta" href="#/post/${escapeHtml(article.payload.slug)}">Read more</a>
                </article>
              </div>`,
    )
    .join('\n');

  return {
    title: `Articles | ${site.title}`,
    description:
      'How we work, what we need from you, and why a custom website or Qortal app is worth the effort.',
    html: `      <main id="main-content">
${renderPageHeader({
  breadcrumbs: [{ label: 'Homepage', href: '#/' }, { label: 'Articles' }],
  heading: 'Notes from the workshop',
  ...(first === undefined ? {} : { cover: first.payload.heroImage }),
  note: 'Process notes, preparation checklists and the reasoning behind custom design work — written for people who are about to start a website or a Qortal app project.',
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
