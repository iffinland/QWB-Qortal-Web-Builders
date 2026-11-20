import type { PriceEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { richContent } from '../owner/rich-text';

/**
 * Pricing & Quotes. Pricing is per project, so this section states that and
 * offers a free, no-obligation quote. It deliberately contains no price figures.
 */
export function renderPricing(prices: readonly PriceEntity[], heading: string): string {
  const price = prices[0];
  const body =
    price === undefined
      ? `              <p class="lead-text">Pricing is agreed per project. <a href="#contact">Contact us</a> for a free, no-obligation quote.</p>`
      : renderQuote(price);

  return `        <section class="price-section section-padding" id="pricing" aria-labelledby="pricing-heading">
          <div class="container">
            <h2 id="pricing-heading" class="section-title">${escapeHtml(heading)}</h2>
            <div class="row justify-content-center">
              <div class="col-lg-8 col-12">
                <div class="quote-box bg-white shadow-lg"${price === undefined ? '' : ` data-owner-collection="prices" data-owner-id="${escapeHtml(price.id)}"`}>
${body}
                </div>
              </div>
            </div>
          </div>
        </section>`;
}

function renderQuote(price: PriceEntity): string {
  const lines = price.payload.lines
    .map(
      (line) =>
        `                    <li><span class="icon" aria-hidden="true">${escapeHtml(line.icon)}</span>${escapeHtml(line.text)}</li>`,
    )
    .join('\n');

  return `                  <div class="lead-text rich-content">${richContent(price, 'intro', price.payload.intro)}</div>
                  <ul class="pricing-lines">
${lines}
                  </ul>
                  <div class="card-meta rich-content">${richContent(price, 'note', price.payload.note)}</div>
                  <div class="card-cta-row">
                    <a class="btn custom-btn mt-2" href="${escapeHtml(price.payload.cta.href)}">${escapeHtml(price.payload.cta.label)}</a>
                  </div>`;
}
