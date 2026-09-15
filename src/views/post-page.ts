import type { ArticleEntity, ContentBundle } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { renderPageHeader } from './page-header';
import { renderArticleBody } from './article-body';
import type { View } from './types';

/** Article detail: gradient band with the article's illustration card, then a
    centred `col-lg-8` reading column with the boxed callouts and note blocks. */
export function createPostView(content: ContentBundle, article: ArticleEntity): View {
  const { site } = content;

  const tags =
    article.payload.tags.length === 0
      ? ''
      : `
            <ul class="article-tags">
${article.payload.tags.map((tag) => `              <li><span class="tag">${escapeHtml(tag)}</span></li>`).join('\n')}
            </ul>`;

  return {
    title: `${article.title} | ${site.title}`,
    description: article.payload.summary,
    html: `      <main id="main-content">
${renderPageHeader({
  breadcrumbs: [
    { label: 'Homepage', href: '#/' },
    { label: 'Articles', href: '#/posts' },
    { label: article.title },
  ],
  heading: article.title,
  cover: article.payload.heroImage,
})}
        <section class="article-section section-padding">
          <div class="container">
            <div class="row">
              <div class="col-lg-8 col-12 m-auto article-body">
                <p class="article-lede">${escapeHtml(article.payload.summary)}</p>
${renderArticleBody(article.payload.blocks)}${tags}
              </div>
            </div>
          </div>
        </section>
      </main>`,
  };
}
