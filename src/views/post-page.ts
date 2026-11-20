import type { ArticleEntity, ContentBundle } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { richContent } from '../owner/rich-text';
import { renderPageHeader } from './page-header';
import { renderArticleBody } from './article-body';
import type { View } from './types';
import { siteUi } from '../content/site-ui';

/** Article detail: gradient band with the article's illustration card, then a
    centred `col-lg-8` reading column with the boxed callouts and note blocks. */
export function createPostView(content: ContentBundle, article: ArticleEntity): View {
  const { site } = content;
  const ui = siteUi(site);

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
    { label: ui.homeLabel, href: '#/' },
    { label: ui.articlesLabel, href: '#/posts' },
    { label: article.title },
  ],
  heading: article.title,
  cover: article.payload.heroImage,
})}
        <section class="article-section section-padding" data-owner-collection="articles" data-owner-id="${escapeHtml(article.id)}">
          <div class="container">
            <div class="row">
              <div class="col-lg-8 col-12 m-auto article-body">
                <div class="article-lede rich-content">${richContent(article, 'summary', article.payload.summary)}</div>
${article.richText?.body !== undefined ? richContent(article, 'body', '') : renderArticleBody(article.payload.blocks)}${tags}
              </div>
            </div>
          </div>
        </section>
      </main>`,
  };
}
