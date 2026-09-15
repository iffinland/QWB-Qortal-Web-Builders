import type { ContentBundle } from '../content/schema';
import { renderPageHeader } from './page-header';
import { renderWorksGrid } from './works';
import type { View } from './types';

/**
 * Completed works: the published gradient header band (breadcrumb + headline +
 * illustration card) followed by the 3/2/1-column portfolio grid.
 *
 * The published header's live-demo/template-gallery CTA reinforced the old
 * "ready-made template" positioning; it is replaced by a custom-build CTA while
 * the band's composition (headline, note line, centred pill) is unchanged.
 */
export function createWorksView(content: ContentBundle): View {
  const { site, works } = content;
  const newest = works[0];

  return {
    title: `Completed works | ${site.title}`,
    description:
      'Websites and Qortal apps built by Qortal Web Builders, each with a live QDN address you can open.',
    html: `      <main id="main-content">
${renderPageHeader({
  breadcrumbs: [{ label: 'Homepage', href: '#/' }, { label: 'Completed works' }],
  heading: 'Gallery of our completed works',
  ...(newest === undefined
    ? {}
    : {
        cover: {
          source: 'placeholder',
          label: newest.title,
          alt: `Preview of ${newest.title}`,
        },
      }),
  note: 'Every project below is published on the Qortal Data Network and opens under its own QDN address. Custom design and custom code mean the same starting point never produces the same website twice.',
  cta: { label: 'Start your project', href: 'qortal://APP/Q-Mail/to/Qortal20Web%20Builders' },
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
