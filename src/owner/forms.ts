/**
 * Form rendering for the owner modal shell.
 *
 * The renderer is descriptor-driven (`fields.ts`) and every content-derived
 * value is escaped here, so a form is never a second injection surface. Values
 * are only ever read back through `readFormValues`, which understands the same
 * descriptors — the form cannot drift from its own reader.
 */

import type { FieldDescriptor, FormValues } from './fields';
import { escapeHtml } from '../ui/html';
import { MEDIA_DISABLED_NOTICE } from './phase';

function renderField(field: FieldDescriptor, values: FormValues): string {
  const id = `qwb-field-${field.name.replace(/\./g, '-')}`;
  const value = values[field.name] ?? '';
  const help =
    field.help === undefined
      ? ''
      : `<p class="qwb-field-help" id="${id}-help">${escapeHtml(field.help)}</p>`;
  const describedBy = field.help === undefined ? '' : ` aria-describedby="${id}-help"`;
  const width = field.fullWidth === true ? ' qwb-field-full' : '';
  const label = `<label class="qwb-field-label" for="${id}">${escapeHtml(field.label)}</label>`;

  const control = ((): string => {
    switch (field.type) {
      case 'textarea':
        return `<textarea class="qwb-input" id="${id}" name="${escapeHtml(field.name)}" rows="${String(
          field.rows ?? 4,
        )}"${field.maxLength === undefined ? '' : ` maxlength="${String(field.maxLength)}"`}${describedBy}>${escapeHtml(value)}</textarea>`;
      case 'lines':
      case 'pairs':
        return `<textarea class="qwb-input qwb-input-lines" id="${id}" name="${escapeHtml(field.name)}" rows="${String(
          field.rows ?? Math.max(3, value.split('\n').length),
        )}"${describedBy}>${escapeHtml(value)}</textarea>`;
      case 'select': {
        const options = (field.options ?? [])
          .map(
            (option) =>
              `<option value="${escapeHtml(option.value)}"${option.value === value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`,
          )
          .join('');
        return `<select class="qwb-input" id="${id}" name="${escapeHtml(field.name)}"${describedBy}>${options}</select>`;
      }
      case 'boolean':
        return `<input class="qwb-checkbox" type="checkbox" id="${id}" name="${escapeHtml(field.name)}" value="true"${value === 'true' ? ' checked' : ''}${describedBy}>`;
      case 'image':
        return `<p class="qwb-field-static" id="${id}">${escapeHtml(value === '' ? 'no image' : value)}</p>
          <button type="button" class="qwb-btn qwb-btn-quiet" data-qwb-media-replace aria-describedby="${id}-media-note" disabled>Replace image</button>
          <p class="qwb-field-help" id="${id}-media-note">${escapeHtml(MEDIA_DISABLED_NOTICE)}</p>`;
      case 'readonly':
        return `<p class="qwb-field-static" id="${id}">${escapeHtml(value === '' ? 'nothing to edit yet' : value)}</p>`;
      case 'text':
        return `<input class="qwb-input" type="text" id="${id}" name="${escapeHtml(field.name)}" value="${escapeHtml(
          value,
        )}"${field.maxLength === undefined ? '' : ` maxlength="${String(field.maxLength)}"`}${
          field.placeholder === undefined ? '' : ` placeholder="${escapeHtml(field.placeholder)}"`
        }${describedBy}>`;
    }
  })();

  return `<div class="qwb-field${width}">
  ${label}
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
  /** The primary action is disabled in Phase 2; the text says why. */
  readonly primaryLabel: string;
  readonly primaryDisabled: boolean;
  readonly primaryDisabledReason?: string;
  readonly secondaryLabel?: string;
}

/**
 * Renders the form body. The `<form>` element itself is created by the flow
 * (so it owns submit wiring); this returns its inner HTML only.
 */
export function renderFormBody(options: FormRenderOptions): string {
  const notice =
    options.noticeHtml === undefined
      ? ''
      : `<div class="qwb-notice qwb-notice-warning" role="note">${options.noticeHtml}</div>`;

  const fields = options.fields.map((field) => renderField(field, options.values)).join('\n');

  const reason =
    options.primaryDisabled && options.primaryDisabledReason !== undefined
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
  <div class="qwb-form-actions">
    ${secondary}
    <button type="button" class="qwb-btn qwb-btn-primary" data-qwb-form-submit${
      options.primaryDisabled ? ' disabled' : ''
    }${options.primaryDisabled ? ' aria-describedby="qwb-primary-reason"' : ''}>${escapeHtml(
      options.primaryLabel,
    )}</button>
  </div>
  ${reason}
</form>`;
}

/** Appends one line to a `lines`-style textarea (used by "Add line" affordances). */
export function appendLine(textarea: HTMLTextAreaElement, line: string): void {
  const current = textarea.value.trimEnd();
  textarea.value = current === '' ? line : `${current}\n${line}`;
}
