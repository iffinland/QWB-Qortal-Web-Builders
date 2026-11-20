import DOMPurify from 'dompurify';
import { escapeHtml } from '../ui/html';
import type { AnyEntity } from '../content/schema';

export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'div', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a'],
    ALLOWED_ATTR: ['href'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|qortal):|#)/i,
  });
}

export function richContent(entity: AnyEntity, field: string, fallback: string): string {
  const html = entity.richText?.[field];
  return html === undefined ? escapeHtml(fallback) : sanitizeRichText(html);
}

export function richControl(name: string, label: string, text: string): string {
  const commands = [['bold', 'Bold'], ['italic', 'Italic'], ['underline', 'Underline'], ['insertUnorderedList', 'Bullets'], ['insertOrderedList', 'Numbered list'], ['formatBlock', 'Heading'], ['undo', 'Undo'], ['redo', 'Redo'], ['removeFormat', 'Clear format'], ['unlink', 'Remove link']];
  return `<div class="owner-field owner-rich-field" data-rich-field="${name}">
    <label class="owner-label" id="rich-label-${name}">${escapeHtml(label)}</label>
    <div class="owner-rich-toolbar" role="toolbar" aria-label="Text formatting">${commands.map(([command, title]) => `<button type="button" data-rich-command="${command}">${title}</button>`).join('')}</div>
    <div class="owner-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="rich-label-${name}">${text.split('\n').map((line) => `<div>${escapeHtml(line) || '<br>'}</div>`).join('')}</div>
    <div class="owner-rich-link"><input type="text" data-rich-url aria-label="Link address" placeholder="Paste link: qortal://… or https://…"><button type="button" data-rich-link>Add link</button></div>
    <textarea name="${name}" hidden>${escapeHtml(text)}</textarea>
  </div>`;
}

export function syncRich(form: HTMLElement): Record<string, string> {
  const rich: Record<string, string> = {};
  for (const field of form.querySelectorAll<HTMLElement>('[data-rich-field]')) {
    const editor = field.querySelector<HTMLElement>('[contenteditable]');
    const stored = field.querySelector<HTMLTextAreaElement>('textarea');
    if (!editor || !stored) continue;
    stored.value = (editor.innerText ?? editor.textContent ?? '').trim();
    rich[field.dataset.richField ?? ''] = sanitizeRichText(editor.innerHTML);
  }
  return rich;
}
