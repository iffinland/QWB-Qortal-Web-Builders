/**
 * Form rendering for the owner modal shell.
 *
 * The renderer is descriptor-driven (`fields.ts`) and every content-derived value
 * is escaped here, so a form is never a second injection surface. Values are only
 * ever read back through `readFormValues`, which understands the same descriptors
 * — the form cannot drift from its own reader.
 *
 * Phase 3 additions:
 *
 *  - the primary action is enabled: it submits the draft to the publish pipeline;
 *  - a **file input** replaces the disabled media placeholder, and the chosen
 *    image is described (encoded type, dimensions, target service) before anything
 *    is published;
 *  - a status region and a `Check status` action exist for the truthful
 *    submitted/verified/rejected/ambiguous/failed outcomes, so a write that is not
 *    yet verified is never presented as done.
 */

import type { FieldDescriptor, FormValues } from './fields';
import { escapeHtml } from '../ui/html';
import { WRITE_ENABLED_NOTICE, WRITE_VERIFY_NOTE } from './phase';

function labelFor(id: string, text: string): string {
  return `<label class="qwb-field-label" for="${id}">${escapeHtml(text)}</label>`;
}

function renderField(field: FieldDescriptor, values: FormValues): string {
  const id = `qwb-field-${field.name.replace(/\./g, '-')}`;
  const value = values[field.name] ?? '';
  const help =
    field.help === undefined
      ? ''
      : `<p class="qwb-field-help" id="${id}-help">${escapeHtml(field.help)}</p>`;
  const describedBy = field.help === undefined ? '' : ` aria-describedby="${id}-help"`;
  const width = field.fullWidth === true ? ' qwb-field-full' : '';

  const control = ((): string => {
    switch (field.type) {
      case 'textarea':
        return `${labelFor(id, field.label)}
<textarea class="qwb-input" id="${id}" name="${escapeHtml(field.name)}" rows="${String(
          field.rows ?? 4,
        )}"${field.maxLength === undefined ? '' : ` maxlength="${String(field.maxLength)}"`}${describedBy}>${escapeHtml(value)}</textarea>`;
      case 'lines':
      case 'pairs':
        return `${labelFor(id, field.label)}
<textarea class="qwb-input qwb-input-lines" id="${id}" name="${escapeHtml(field.name)}" rows="${String(
          field.rows ?? Math.max(3, value.split('\n').length),
        )}"${describedBy}>${escapeHtml(value)}</textarea>`;
      case 'blocks':
        return `${labelFor(id, field.label)}
<textarea class="qwb-input qwb-input-blocks" id="${id}" name="${escapeHtml(field.name)}" rows="${String(
          field.rows ?? 12,
        )}" aria-describedby="${id}-help" spellcheck="false">${escapeHtml(value)}</textarea>`;
      case 'select': {
        const options = (field.options ?? [])
          .map(
            (option) =>
              `<option value="${escapeHtml(option.value)}"${option.value === value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`,
          )
          .join('');
        return `${labelFor(id, field.label)}
<select class="qwb-input" id="${id}" name="${escapeHtml(field.name)}"${describedBy}>${options}</select>`;
      }
      case 'boolean':
        return `<div class="qwb-field-check">
  <input class="qwb-checkbox" type="checkbox" id="${id}" name="${escapeHtml(field.name)}" value="true"${value === 'true' ? ' checked' : ''}${describedBy}>
  ${labelFor(id, field.label)}
</div>`;
      case 'image':
        return `${labelFor(`${id}-file`, field.label)}
<p class="qwb-field-static" id="${id}">${escapeHtml(value === '' ? 'no image' : value)}</p>
<input class="qwb-input qwb-input-file" type="file" id="${id}-file" name="${escapeHtml(field.name)}.media" accept="image/webp,image/jpeg,image/png" data-qwb-media="${escapeHtml(field.name)}" aria-describedby="${id}-media-note">
<p class="qwb-field-help" id="${id}-media-note" data-qwb-media-note="${escapeHtml(field.name)}">No new image chosen — the current image stays.</p>`;
      case 'readonly':
        return `${labelFor(id, field.label)}
<p class="qwb-field-static" id="${id}">${escapeHtml(value === '' ? 'nothing to edit yet' : value)}</p>`;
      case 'text':
        return `${labelFor(id, field.label)}
<input class="qwb-input" type="text" id="${id}" name="${escapeHtml(field.name)}" value="${escapeHtml(
          value,
        )}"${field.maxLength === undefined ? '' : ` maxlength="${String(field.maxLength)}"`}${
          field.placeholder === undefined ? '' : ` placeholder="${escapeHtml(field.placeholder)}"`
        }${describedBy}>`;
    }
  })();

  return `<div class="qwb-field${width}">
  ${control}
  ${help}
</div>`;
}

export interface FormRenderOptions {
  readonly fields: readonly FieldDescriptor[];
  readonly values: FormValues;
  readonly title: string;
  readonly subtitle: string;
  /** Escaped notice shown above the fields. */
  readonly noticeHtml?: string;
  readonly primaryLabel: string;
  readonly primaryDisabled?: boolean;
  readonly primaryDisabledReason?: string;
  readonly secondaryLabel?: string;
  /** Extra wording under the actions (e.g. what publishing costs/means). */
  readonly footerNote?: string;
}

/**
 * Renders the form body. The `<form>` element itself is created by the flow
 * (so it owns submit wiring); this returns its inner HTML only.
 */
export function renderFormBody(options: FormRenderOptions): string {
  const notice =
    options.noticeHtml === undefined
      ? ''
      : `<div class="qwb-notice qwb-notice-info" role="note">${options.noticeHtml}</div>`;

  const fields = options.fields.map((field) => renderField(field, options.values)).join('\n');

  const disabled = options.primaryDisabled === true;
  const reason =
    disabled && options.primaryDisabledReason !== undefined
      ? `<p class="qwb-field-help" id="qwb-primary-reason">${escapeHtml(options.primaryDisabledReason)}</p>`
      : '';

  const secondary =
    options.secondaryLabel === undefined
      ? ''
      : `<button type="button" class="qwb-btn qwb-btn-secondary" data-qwb-form-validate>${escapeHtml(
          options.secondaryLabel,
        )}</button>`;

  return `${notice}
<form class="qwb-form" data-qwb-form novalidate>
  <div class="qwb-form-heading">
    <h3 class="qwb-form-title">${escapeHtml(options.title)}</h3>
    <p class="qwb-form-subtitle">${escapeHtml(options.subtitle)}</p>
  </div>
  <div class="qwb-form-grid">
${fields}
  </div>
  <div class="qwb-form-result" data-qwb-form-result hidden></div>
  <div class="qwb-form-status" data-qwb-form-status role="status" aria-live="polite" hidden></div>
  <div class="qwb-form-actions">
    ${secondary}
    <button type="button" class="qwb-btn qwb-btn-secondary" data-qwb-form-check hidden>Check status</button>
    <button type="button" class="qwb-btn qwb-btn-primary" data-qwb-form-submit${
      disabled ? ' disabled' : ''
    }${disabled ? ' aria-describedby="qwb-primary-reason"' : ''}>${escapeHtml(
      options.primaryLabel,
    )}</button>
  </div>
  ${reason}
  <p class="qwb-field-help qwb-form-note">${WRITE_VERIFY_NOTE}</p>
</form>`;
}

/** The default notice for any form whose primary action publishes. */
export const PUBLISH_NOTICE = WRITE_ENABLED_NOTICE;

/** Appends one line to a `lines`-style textarea (used by "Add line" affordances). */
export function appendLine(textarea: HTMLTextAreaElement, line: string): void {
  const current = textarea.value.trimEnd();
  textarea.value = current === '' ? line : `${current}\n${line}`;
}
