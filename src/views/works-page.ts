import type { ContentBundle } from '../content/schema';
import { renderPageHeader } from './page-header';
import { renderWorksGrid } from './works';
import type { View } from './types';
import { siteUi } from '../content/site-ui';

/** All projects: the full portfolio, each card opening its own project page. */
export function createWorksView(content: ContentBundle): View {
  const { site, works } = content;
  const first = works[0];
  const ui = siteUi(site);

  return {
    title: `${ui.portfolioLabel} | ${site.title}`,
    description: ui.worksDescription,
    html: `      <main id="main-content">
${renderPageHeader({
  breadcrumbs: [{ label: ui.homeLabel, href: '#/' }, { label: ui.portfolioLabel }],
  heading: ui.worksHeading,
  ...(first === undefined || first.payload.images[0] === undefined
    ? {}
    : { cover: first.payload.images[0] }),
  note: ui.worksNote,
  cta: ui.worksCta,
})}
        <section class="works-section section-padding">
          <div class="container">
            <div class="row">
${renderWorksGrid(works, ui.viewProject)}
            </div>
          </div>
        </section>
      </main>`,
  };
}
