import type { SiteEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';

/**
 * Transparent navbar on the gradient band: brand mark + wordmark on the left,
 * four links on the right. This is the published composition with the
 * duplicated empty `<li>` and the `click-scroll` jQuery hooks removed. The
 * mobile collapse is toggled natively (see `ui/nav.ts`).
 */
export function renderNavbar(site: SiteEntity, activeHref: string): string {
  const { brand, nav } = site.payload;

  const items = nav
    .map((item) => {
      const isActive = activeHref !== '' && item.href === activeHref;
      const linkClass = isActive ? 'nav-link active' : 'nav-link';
      const current = isActive ? ' aria-current="true"' : '';
      return `              <li class="nav-item">
                <a class="${linkClass}"${current} href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>
              </li>`;
    })
    .join('\n');

  return `        <nav class="navbar navbar-expand-lg navbar-sticky" id="site-navbar" aria-label="Main">
          <div class="container">
            <a class="navbar-brand" href="#/">
              <img src="${escapeHtml(brand.markSrc)}" alt="${escapeHtml(site.title)}" width="70" height="70">
              <span>${escapeHtml(brand.name)}</span>
            </a>
            <button class="navbar-toggler" type="button" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
              <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
              <ul class="navbar-nav ms-lg-5 me-lg-auto">
${items}
              </ul>
            </div>
          </div>
        </nav>`;
}
