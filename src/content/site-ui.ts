import type { SiteEntity, SiteUiCopy } from './schema';
import { OWNER_QMAIL } from './contact-link';

/** Defaults keep already-published schema-v1 site resources compatible. */
export const DEFAULT_SITE_UI: SiteUiCopy = {
  articlesLabel: 'Articles',
  homeLabel: 'Home',
  portfolioLabel: 'Portfolio',
  portfolioIntro: 'Selected projects, each published on the Qortal Data Network.',
  portfolioEmpty: 'Our projects will appear here.',
  viewAllProjects: 'View all {count} projects',
  viewProject: 'View project',
  worksHeading: 'Our portfolio',
  worksDescription: 'Websites and Qortal apps built by Qortal Web Builders, each with a project page and direct links to the live site.',
  worksNote: 'Every project below is published on the Qortal Data Network. Open a project for its gallery, description and live links.',
  worksCta: { label: 'Request a free quote', href: OWNER_QMAIL },
  postsHeading: 'Notes from the workshop',
  postsDescription: 'How we work, what we need from you, and why a custom website or Qortal app is worth the effort.',
  postsNote: 'Process notes, preparation checklists and the reasoning behind custom design work — written for people who are about to start a website or a Qortal app project.',
  readMore: 'Read more',
  galleryHeading: 'Gallery',
  aboutProjectHeading: 'About this project',
  openProjectHeading: 'Open the project',
  backToProjects: 'Back to all projects',
  notFoundTitle: 'Page not found',
  notFoundHeading: 'This page is not here',
  notFoundMessage: 'No view matches {path}.',
  backHome: 'Back to the front page',
};

export function siteUi(site: SiteEntity): SiteUiCopy {
  return { ...DEFAULT_SITE_UI, ...site.payload.ui };
}

export function interpolate(text: string, values: Readonly<Record<string, string | number>>): string {
  return text.replace(/\{([a-z]+)\}/gi, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
