import type { ServiceEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { richContent } from '../owner/rich-text';

/** Services: the two offerings, each as a card with its bullet list and a call to action. */
export function renderServices(services: readonly ServiceEntity[], heading: string): string {
  const cards = services.map((service) => renderServiceCard(service)).join('\n');

  return `        <section class="services-section section-padding section-bg" id="services" aria-labelledby="services-heading">
          <div class="container">
            <h2 id="services-heading" class="section-title">${escapeHtml(heading)}</h2>
            <div class="row">
${cards}
            </div>
          </div>
        </section>`;
}

function renderServiceCard(service: ServiceEntity): string {
  const { summary, bullets, icon, cta } = service.payload;
  const items = bullets
    .map((bullet) => `                    <li>${escapeHtml(bullet)}</li>`)
    .join('\n');
  const action =
    cta === undefined
      ? ''
      : `
                  <div class="card-cta-row">
                    <a class="btn custom-btn mt-2 card-cta" href="${escapeHtml(cta.href)}">${escapeHtml(cta.label)}</a>
                  </div>`;

  return `              <div class="col-lg-6 col-12 mb-4">
                <article class="custom-block bg-white shadow-lg service-card" data-owner-collection="services" data-owner-id="${escapeHtml(service.id)}">
                  <span class="service-icon" aria-hidden="true">${escapeHtml(icon)}</span>
                  <h3 class="card-title mb-2">${escapeHtml(service.title)}</h3>
                  <div class="rich-content">${richContent(service, 'summary', summary)}</div>
                  <ul class="service-list">
${items}
                  </ul>${action}
                </article>
              </div>`;
}
