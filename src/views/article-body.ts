import type { ArticleBlock } from '../content/schema';
import { escapeHtml, renderInline } from '../ui/html';

/**
 * Article body renderer.
 *
 * Blocks carry plain text plus explicit inline link runs, so nothing is ever
 * injected as HTML: the text is escaped and only safe-scheme hrefs become
 * links. Phase 3 adds sanitised rich text on top of this renderer rather than
 * replacing it.
 */
export function renderArticleBody(blocks: readonly ArticleBlock[]): string {
  return blocks.map((block) => renderBlock(block)).join('\n');
}

function renderBlock(block: ArticleBlock): string {
  switch (block.type) {
    case 'paragraph':
      return `            <p>${escapeHtml(block.text)}</p>`;
    case 'heading':
      return `            <h2 class="article-heading">${escapeHtml(block.text)}</h2>`;
    case 'bullets': {
      const items = block.items
        .map((item) => `              <li>${renderInline(item)}</li>`)
        .join('\n');
      return `            <ul>\n${items}\n            </ul>`;
    }
    case 'note': {
      const action =
        block.action === undefined
          ? ''
          : `\n              <a class="article-note-action" href="${escapeHtml(block.action.href)}">${escapeHtml(block.action.label)}</a>`;
      return `            <div class="article-note">
              <p class="mb-0">${escapeHtml(block.text)}</p>${action}
            </div>`;
    }
  }
}
