import type { StepEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { renderImage } from '../ui/image';

/**
 * Numbered process step cards: title + description + numbered pill on the
 * right, full-width illustration below. The published cards had no `<h1>`-safe
 * heading order issue here, but the badge is decorative (the DOM order already
 * carries the sequence) and the card link is a stretched link on the title.
 */
export function renderSteps(steps: readonly StepEntity[]): string {
  return steps
    .map((step, index) => {
      const href = step.payload.link?.href ?? '#/posts';
      return `                  <div class="col-lg-4 col-md-6 col-12 mb-4 mb-lg-0">
                    <article class="custom-block bg-white shadow-lg">
                      <div class="d-flex">
                        <div>
                          <h5 class="card-title mb-2"><a class="card-link" href="${escapeHtml(href)}">${escapeHtml(step.title)}</a></h5>
                          <p class="mb-0">${escapeHtml(step.payload.description)}</p>
                        </div>
                        <span class="badge bg-advertising rounded-pill ms-auto" aria-hidden="true">${index + 1}</span>
                      </div>
                      ${renderImage(step.payload.illustration, { className: 'custom-block-image img-fluid' })}
                    </article>
                  </div>`;
    })
    .join('\n');
}
