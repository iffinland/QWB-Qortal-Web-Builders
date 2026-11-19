import type { SiteEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { renderImage } from '../ui/image';

/**
 * Hero: the full QWB logo on a white card (its navy wordmark would disappear on
 * the gradient), the headline, the subtitle and two calls to action.
 */
export function renderHero(site: SiteEntity): string {
  const { hero } = site.payload;

  return `        <section class="hero-section d-flex justify-content-center align-items-center" id="hero" aria-labelledby="hero-heading">
          <div class="container">
            <div class="row align-items-center">
              <div class="col-lg-5 col-12 mb-4 mb-lg-0">
                <div class="brand-logo-card bg-white shadow-lg">
                  ${renderImage(site.payload.logo, { className: 'brand-logo-image img-fluid' })}
                </div>
              </div>
              <div class="col-lg-7 col-12 text-center text-lg-start">
                <h1 id="hero-heading" class="text-white">${escapeHtml(hero.heading)}</h1>
                <p class="hero-subtitle mb-4">${escapeHtml(hero.subtitle)}</p>
                <div class="hero-actions">
                  <a class="btn custom-btn" href="${escapeHtml(hero.primaryCta.href)}">${escapeHtml(hero.primaryCta.label)}</a>
                  <a class="btn custom-btn custom-btn-bg-white" href="${escapeHtml(hero.secondaryCta.href)}">${escapeHtml(hero.secondaryCta.label)}</a>
                </div>
              </div>
            </div>
          </div>
        </section>`;
}
