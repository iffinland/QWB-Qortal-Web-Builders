import type { SiteEntity } from '../content/schema';
import { escapeHtml, renderInline } from '../ui/html';

/**
 * Footer: brand mark + "since …" line, one compact credit row, and (from
 * theme.css) the 10 px aquamarine bottom border with the diagonal corner motif.
 */
export function renderFooter(site: SiteEntity): string {
  const { brand, footer } = site.payload;

  return `        <footer class="site-footer section-padding">
          <div class="container">
            <div class="site-footer-brand mb-4">
              <a class="navbar-brand" href="#/" aria-label="${escapeHtml(site.title)}">
                <img src="${escapeHtml(brand.markSrc)}" alt="" width="70" height="70">
              </a>
              <span>${escapeHtml(brand.since)} | ${escapeHtml(site.title)}</span>
            </div>
            <hr class="footer-divider">
            <p class="site-footer-credit mb-2">${renderInline(footer.credit)}</p>
            <p class="site-footer-credit mb-0">${escapeHtml(footer.creditNote)}</p>
          </div>
        </footer>`;
}
