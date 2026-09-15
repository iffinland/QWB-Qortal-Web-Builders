import type { SiteEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';

/**
 * Alice-blue contact band: two quiet columns of label/value rows whose values
 * are Qortal deep links. The published columns were pushed apart by
 * `ms-auto`/`mx-auto` (an off-centre look); they are centred here.
 */
export function renderContact(site: SiteEntity): string {
  const { contact } = site.payload;

  const columns = contact.columns
    .map((column) => {
      const rows = column.rows
        .map(
          (row) =>
            `                      <p class="d-flex align-items-center mb-1">
                        <span class="me-2">${escapeHtml(row.label)}</span>
                        <a class="site-footer-link" href="${escapeHtml(row.href)}">${escapeHtml(row.value)}</a>
                      </p>`,
        )
        .join('\n');
      return `                  <div class="col-lg-4 col-md-6 col-12 contact-block mb-4 mb-md-0">
                    <p class="mb-1">${escapeHtml(column.title)}</p>
                    <hr>
${rows}
                  </div>`;
    })
    .join('\n');

  return `        <section class="contact-section section-padding section-bg" id="section_5">
          <div class="container">
            <div class="row justify-content-center">
              <div class="col-12 text-center">
                <h2 class="mb-5">${escapeHtml(contact.heading)}</h2>
              </div>
${columns}
            </div>
          </div>
        </section>`;
}
