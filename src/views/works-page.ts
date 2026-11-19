import type { ContentBundle } from '../content/schema';
import { renderPageHeader } from './page-header';
import { renderWorksGrid } from './works';
import type { View } from './types';

/** All projects: the full portfolio, each card opening its own project page. */
export function createWorksView(content: ContentBundle): View {
  const { site, works } = content;
  const first = works[0];

  return {
    title: `Portfolio | ${site.title}`,
    description:
      'Websites and Qortal apps built by Qortal Web Builders, each with a project page and direct links to the live site.',
    html: `      <main id="main-content">
${renderPageHeader({
  breadcrumbs: [{ label: 'Home', href: '#/' }, { label: 'Portfolio' }],
  heading: 'Our portfolio',
  ...(first === undefined || first.payload.images[0] === undefined
    ? {}
    : { cover: first.payload.images[0] }),
  note: 'Every project below is published on the Qortal Data Network. Open a project for its gallery, description and live links.',
  cta: { label: 'Request a free quote', href: 'qortal://APP/Q-Mail/to/Qortal20Web%20Builders' },
})}
        <section class="works-section section-padding">
          <div class="container">
            <div class="row">
${renderWorksGrid(works)}
            </div>
          </div>
        </section>
      </main>`,
  };
}
