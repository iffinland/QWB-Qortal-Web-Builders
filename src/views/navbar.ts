import type { SiteEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { renderImage } from '../ui/image';

/**
 * Navbar: the full logo on a white card, and the one-page section links. The
 * active link follows the section in view (scroll-spy, see `ui/nav.ts`).
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
            <a class="navbar-brand" href="#/" aria-label="${escapeHtml(brand.name)}, home">
              <span class="brand-logo-card brand-logo-card--nav bg-white">
                ${renderImage(site.payload.logo, { className: 'brand-logo-image img-fluid' })}
              </span>
            </a>
            <button class="navbar-toggler" type="button" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
              <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
              <ul class="navbar-nav ms-lg-auto me-lg-0">
${items}
              </ul>
            </div>
          </div>
        </nav>`;
}
