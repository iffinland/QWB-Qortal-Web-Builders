import type { StepEntity } from '../content/schema';
import { escapeHtml } from '../ui/html';
import { richContent } from '../owner/rich-text';
import { renderImage } from '../ui/image';

/** How It Works: numbered process steps, each with its illustration. */
export function renderHowItWorks(steps: readonly StepEntity[], heading: string): string {
  const cards = steps
    .map((step, index) => {
      return `              <div class="col-lg-4 col-md-6 col-12 mb-4">
                <article class="custom-block bg-white shadow-lg" data-owner-collection="steps" data-owner-id="${escapeHtml(step.id)}">
                  <div class="d-flex align-items-start">
                    <span class="step-number" aria-hidden="true">${index + 1}</span>
                    <h3 class="card-title mb-2 ms-3">${escapeHtml(step.title)}</h3>
                  </div>
                  <div class="rich-content mb-0">${richContent(step, 'description', step.payload.description)}</div>
                  ${renderImage(step.payload.illustration, { className: 'custom-block-image img-fluid' })}
                </article>
              </div>`;
    })
    .join('\n');

  return `        <section class="process-section section-padding section-bg" id="how-it-works" aria-labelledby="how-it-works-heading">
          <div class="container">
            <h2 id="how-it-works-heading" class="section-title">${escapeHtml(heading)}</h2>
            <div class="row">
${cards}
            </div>
          </div>
        </section>`;
}
