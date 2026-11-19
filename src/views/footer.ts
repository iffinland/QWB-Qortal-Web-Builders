import type { SiteEntity } from '../content/schema';
import { escapeHtml, renderInline } from '../ui/html';
import { renderImage } from '../ui/image';

/** Footer: icon mark, the one-page links, the credit row and the aquamarine border motif. */
export function renderFooter(site: SiteEntity): string {
  const { brand, footer, nav } = site.payload;

  const links = [...nav, { label: 'Articles', href: '#/posts' }]
    .map(
      (item) =>
        `              <li><a class="site-footer-link" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`,
    )
    .join('\n');

  return `        <footer class="site-footer section-padding">
          <div class="container">
            <div class="site-footer-brand mb-4">
              ${renderImage(site.payload.mark, { className: 'site-footer-mark', width: 64, height: 64 })}
              <span>${escapeHtml(brand.since)} | ${escapeHtml(site.title)}</span>
            </div>
            <ul class="site-footer-links mb-4" aria-label="Footer">
${links}
            </ul>
            <hr class="footer-divider">
            <p class="site-footer-credit mb-2">${renderInline(footer.credit)}</p>
            <p class="site-footer-credit mb-0">${escapeHtml(footer.creditNote)}</p>
          </div>
        </footer>`;
}
