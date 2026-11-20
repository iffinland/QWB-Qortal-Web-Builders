import type { ContentBundle, VideoRef, WorkEntity } from '../content/schema';
import { videoUrl } from '../content/media';
import { escapeHtml } from '../ui/html';
import { richContent } from '../owner/rich-text';
import { qdnAttributes } from '../ui/qdn-media';
import { renderImage } from '../ui/image';
import type { View } from './types';
import { siteUi } from '../content/site-ui';

/**
 * Project page (`#/work/<slug>`): breadcrumb, title and categories, the gallery of
 * every image, the optional video, the long-form description, and the direct
 * Qortal links. Headings are ordered (h1 title, h2 sections) and every image and
 * the video carry an accessible name.
 */
export function createWorkView(content: ContentBundle, work: WorkEntity): View {
  const { site } = content;
  const ui = siteUi(site);
  const { summary, description, categories, images, video, links } = work.payload;

  const categoryItems = categories
    .map((category) => `                <li><span class="tag">${escapeHtml(category)}</span></li>`)
    .join('\n');

  const gallery = images
    .map(
      (image) =>
        `                <figure class="work-figure">${renderImage(image, { className: 'work-image img-fluid' })}</figure>`,
    )
    .join('\n');

  const videoBlock = video === undefined ? '' : renderVideo(video);

  const paragraphs = work.richText?.description !== undefined ? richContent(work, 'description', description.join('\n')) : description
    .map((paragraph) => `              <p>${escapeHtml(paragraph)}</p>`)
    .join('\n');

  const linkButtons = links
    .map(
      (link) =>
        `                <a class="btn custom-btn work-link" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`,
    )
    .join('\n');

  return {
    title: `${work.title} | ${site.title}`,
    description: summary,
    html: `      <main id="main-content">
        <header class="site-header" data-owner-collection="works" data-owner-id="${escapeHtml(work.id)}">
          <div class="container">
            <nav aria-label="Breadcrumb">
              <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="#/">${escapeHtml(ui.homeLabel)}</a></li>
                <li class="breadcrumb-item"><a href="#/works">${escapeHtml(ui.portfolioLabel)}</a></li>
                <li class="breadcrumb-item active" aria-current="page">${escapeHtml(work.title)}</li>
              </ol>
            </nav>
            <h1 class="page-title">${escapeHtml(work.title)}</h1>
            <ul class="article-tags work-categories" aria-label="Categories">
${categoryItems}
            </ul>
            <div class="site-header-note rich-content">${richContent(work, 'summary', summary)}</div>
          </div>
        </header>
        <section class="work-detail section-padding" aria-labelledby="work-gallery-heading">
          <div class="container">
            <div class="row">
              <div class="col-lg-8 col-12 mb-5 mb-lg-0">
                <h2 id="work-gallery-heading" class="section-heading">${escapeHtml(ui.galleryHeading)}</h2>
                <div class="work-gallery">
${gallery}
${videoBlock}
                </div>
              </div>
              <aside class="col-lg-4 col-12" aria-labelledby="work-about-heading">
                <div class="custom-block bg-white shadow-lg work-about">
                  <h2 id="work-about-heading" class="section-heading">${escapeHtml(ui.aboutProjectHeading)}</h2>
${paragraphs}
                  <h2 class="section-heading mt-4">${escapeHtml(ui.openProjectHeading)}</h2>
${linkButtons}
                </div>
              </aside>
            </div>
            <div class="card-cta-row mt-5">
              <a class="btn custom-btn" href="#/works">${escapeHtml(ui.backToProjects)}</a>
            </div>
          </div>
        </section>
      </main>`,
  };
}

function renderVideo(video: VideoRef): string {
  const src = videoUrl(video);
  return `                <figure class="work-figure">
                  <video class="work-video" controls preload="metadata" src="${escapeHtml(src)}" ${qdnAttributes('VIDEO', video.name, video.identifier)} aria-label="${escapeHtml(video.title)}">
                    <a href="${escapeHtml(src)}">Download the video: ${escapeHtml(video.title)}</a>
                  </video>
                  <figcaption class="card-meta">${escapeHtml(video.title)}</figcaption>
                </figure>`;
}
