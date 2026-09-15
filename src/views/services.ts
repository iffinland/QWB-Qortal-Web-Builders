import type { LinkRef, ServiceEntity, SiteEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';

/**
 * "What we build" pane: one wide white card carrying the services as a bullet
 * list plus a single pill CTA - the same single-block anatomy the published
 * "Template Gallery" pane used, with the message repositioned onto custom
 * websites, custom Qortal apps and design work.
 */
export function renderServicesBlock(
  services: readonly ServiceEntity[],
  site: SiteEntity,
  cta?: LinkRef,
): string {
  const items = services
    .map(
      (service) =>
        `                            <li><strong>${escapeHtml(service.title)}</strong> — ${escapeHtml(service.payload.summary)}</li>`,
    )
    .join('\n');

  const ctaBlock =
    cta === undefined
      ? ''
      : `
                            <div class="card-cta-row">
                              <a class="btn custom-btn mt-2 mt-lg-3 card-cta" href="${escapeHtml(cta.href)}">${escapeHtml(cta.label)}</a>
                            </div>`;

  return `                          <div class="custom-block bg-white shadow-lg">
                            <h5 class="card-title mb-2">What we build at ${escapeHtml(site.title)}</h5>
                            <ul>
${items}
                            </ul>${ctaBlock}
                          </div>`;
}
