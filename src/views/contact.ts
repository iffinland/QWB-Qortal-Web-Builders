import type { SiteEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { richContent } from '../owner/rich-text';

/**
 * Contact: owner-editable intro and contact columns. Values are Qortal deep
 * links (Q-Mail, the group), so they open inside the Qortal host.
 */
export function renderContact(site: SiteEntity): string {
  const { contact } = site.payload;

  const columns = contact.columns
    .map((column) => {
      const rows = column.rows
        .map(
          (row) => `                    <p class="d-flex align-items-center mb-1">
                      <span class="me-2">${escapeHtml(row.label)}:</span>
                      <a class="site-footer-link" href="${escapeHtml(row.href)}">${escapeHtml(row.value)}</a>
                    </p>`,
        )
        .join('\n');
      return `              <div class="col-lg-5 col-md-6 col-12 contact-block mb-4">
                <h3 class="contact-column-title">${escapeHtml(column.title)}</h3>
                <hr>
${rows}
              </div>`;
    })
    .join('\n');

  return `        <section class="contact-section section-padding section-bg" id="contact" aria-labelledby="contact-heading">
          <div class="container">
            <div class="row justify-content-center">
              <div class="col-lg-8 col-12 text-center">
                <h2 id="contact-heading" class="mb-3">${escapeHtml(contact.heading)}</h2>
                <div class="lead-text mb-5 rich-content">${richContent(site, 'contactIntro', contact.intro)}</div>
              </div>
            </div>
            <div class="row justify-content-center">
${columns}
            </div>
          </div>
        </section>`;
}
