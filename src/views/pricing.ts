import type { PriceEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';

/**
 * Two-box pricing row: light boxed treatment, emoji bullet lines and a green
 * order CTA per box. The published boxes were unstructured `<div>`s inside an
 * incorrectly nested `<section>` and their buttons had no hover/focus state;
 * both are fixed here without changing the composition.
 */
export function renderPricing(prices: readonly PriceEntity[], heading: string): string {
  const boxes = prices.map((price) => renderPriceBox(price)).join('\n');

  return `        <section class="price-section section-padding" id="section_3">
          <h2 class="section-title">${escapeHtml(heading)}</h2>
          <div class="pricing-container">
${boxes}
          </div>
        </section>`;
}

function renderPriceBox(price: PriceEntity): string {
  const lines = price.payload.lines
    .map(
      (line) =>
        `              <p class="pricing-line"><span class="icon" aria-hidden="true">${escapeHtml(line.icon)}</span>${escapeHtml(line.text)}</p>`,
    )
    .join('\n');

  return `            <article class="pricing-box">
              <h5>${escapeHtml(price.title)}</h5>
${lines}
              <p class="card-meta">${escapeHtml(price.payload.note)}</p>
              <a class="order-btn" href="${escapeHtml(price.payload.cta.href)}">${escapeHtml(price.payload.cta.label)}</a>
            </article>`;
}
