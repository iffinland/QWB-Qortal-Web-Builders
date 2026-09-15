import type { SiteEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';

/**
 * Full-width gradient hero band, white centred headline and a subtitle.
 * The published markup used an `<h6>` for the subtitle (a heading-order
 * defect); it is a paragraph here, and its colour is white instead of the
 * published `--primary-color`, which measured only 2.7:1 against this gradient.
 */
export function renderHero(site: SiteEntity): string {
  const { hero } = site.payload;

  return `        <section class="hero-section d-flex justify-content-center align-items-center" id="section_1">
          <div class="container">
            <div class="row">
              <div class="col-lg-8 col-12 mx-auto">
                <h1 class="text-white text-center">${escapeHtml(hero.heading)}</h1>
                <p class="hero-subtitle text-center mb-0">${escapeHtml(hero.subtitle)}</p>
              </div>
            </div>
          </div>
        </section>`;
}
