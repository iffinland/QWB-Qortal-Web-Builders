import type { ContentBundle, SectionId, SiteEntity } from '../content/schema';
import { featuredWorks } from '../content/repository';
import { renderContact } from './contact';
import { renderHero } from './hero';
import { renderHowItWorks } from './how-it-works';
import { renderPortfolio } from './portfolio';
import { renderPricing } from './pricing';
import { renderServices } from './services';
import type { View } from './types';

function sectionOf(site: SiteEntity, id: SectionId) {
  return site.payload.sections.find((section) => section.id === id);
}

function labelOf(site: SiteEntity, id: SectionId): string {
  return sectionOf(site, id)?.label ?? '';
}

function isVisible(site: SiteEntity, id: SectionId): boolean {
  return sectionOf(site, id)?.visible ?? false;
}

/**
 * The one-page home: hero, services, portfolio, how it works, pricing & quotes,
 * contact, in that order. Visibility and labels come from `site.sections`, so the
 * owner can hide a section without touching the renderer.
 */
export function createHomeView(content: ContentBundle): View {
  const { site } = content;

  const parts: string[] = [];
  if (isVisible(site, 'hero')) parts.push(renderHero(site));
  if (isVisible(site, 'services')) {
    parts.push(renderServices(content.services, labelOf(site, 'services')));
  }
  if (isVisible(site, 'portfolio')) {
    parts.push(
      renderPortfolio(featuredWorks(content), content.works.length, labelOf(site, 'portfolio')),
    );
  }
  if (isVisible(site, 'how-it-works')) {
    parts.push(renderHowItWorks(content.steps, labelOf(site, 'how-it-works')));
  }
  if (isVisible(site, 'pricing')) {
    parts.push(renderPricing(content.prices, labelOf(site, 'pricing')));
  }
  if (isVisible(site, 'contact')) parts.push(renderContact(site));

  return {
    title: site.payload.meta.title,
    description: site.payload.meta.description,
    html: `      <main id="main-content">
${parts.join('\n')}
      </main>`,
  };
}
