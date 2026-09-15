import type { HighlightEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';

/**
 * The featured pair: an asymmetric 4/6 two-card row that is pulled up over the
 * gradient/aquamarine boundary (`.featured-section .row` in theme.css).
 * - `plain`   → white card with bullet list, coloured question line, pill CTA
 * - `overlay` → gradient overlay card with white text and a pill CTA
 * Both variants keep the published card anatomy; the invalid `<li>`-outside-a-
 * list markup and the whole-card `<a>` wrapper (which swallowed text selection
 * and nested interactive elements) are gone.
 */
export function renderHighlights(highlights: readonly HighlightEntity[]): string {
  if (highlights.length === 0) return '';

  const cards = highlights.map((highlight) => renderHighlight(highlight)).join('\n');

  return `        <section class="featured-section" id="section_featured">
          <div class="container">
            <div class="row justify-content-center">
${cards}
            </div>
          </div>
        </section>`;
}

function renderHighlight(highlight: HighlightEntity): string {
  const { title, payload } = highlight;

  if (payload.variant === 'overlay') {
    const bullets = payload.bullets
      .map((bullet) => `                      <li>${escapeHtml(bullet)}</li>`)
      .join('\n');
    return `              <div class="col-lg-6 col-12">
                <article class="custom-block custom-block-overlay">
                  <div class="section-overlay"></div>
                  <div class="custom-block-overlay-text">
                    <h5 class="text-white mb-2"><a class="card-link text-white" href="${escapeHtml(payload.cta.href)}">${escapeHtml(title)}</a></h5>
                    <p class="overlay-lede text-white mb-3">${escapeHtml(payload.body)}</p>
                    <ul class="overlay-list">
${bullets}
                    </ul>
                    <a class="btn custom-btn mt-2 mt-lg-3 card-cta" href="${escapeHtml(payload.cta.href)}">${escapeHtml(payload.cta.label)}</a>
                  </div>
                </article>
              </div>`;
  }

  const bullets = payload.bullets
    .map((bullet) => `                      <li class="text-black">${escapeHtml(bullet)}</li>`)
    .join('\n');

  return `              <div class="col-lg-4 col-12 mb-4 mb-lg-0">
                <article class="custom-block bg-white shadow-lg">
                  <h5 class="card-title mb-2"><a class="card-link" href="${escapeHtml(payload.cta.href)}">${escapeHtml(title)}</a></h5>
                  <ul class="highlight-list">
${bullets}
                  </ul>
                  <h6>${escapeHtml(payload.body)}</h6>
                  <div class="card-cta-row">
                    <a class="btn custom-btn mt-2 mt-lg-3 card-cta" href="${escapeHtml(payload.cta.href)}">${escapeHtml(payload.cta.label)}</a>
                  </div>
                </article>
              </div>`;
}
