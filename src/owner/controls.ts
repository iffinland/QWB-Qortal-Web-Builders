import { escapeHtml } from '../ui/html';

const layouts: Record<string, string[]> = {
  nav: ['Link text', 'Destination'], links: ['Link text', 'Destination'],
  heroPrimary: ['Button text', 'Destination'], heroSecondary: ['Button text', 'Destination'],
  worksCta: ['Button text', 'Destination'], cta: ['Button text', 'Destination'],
  contactRows: ['Group heading', 'Label', 'Text', 'Destination'],
  sections: ['Section', 'Heading', 'Visible'],
  footerCredit: ['Text', 'Link (optional)'], lines: ['Icon', 'Text'],
  bullets: ['Bullet point'], categories: ['Category'], tags: ['Tag'],
};
const singles = new Set(['heroPrimary', 'heroSecondary', 'worksCta', 'cta']);

export function structuredControl(name: string, label: string, value: string): string | null {
  const columns = layouts[name];
  if (!columns) return null;
  const separator = name === 'categories' || name === 'tags' ? ',' : '\n';
  const rows = value ? value.split(separator).filter((line) => line.trim()) : [''];
  return `<fieldset class="owner-structured" data-structured="${name}"><legend>${escapeHtml(label)}</legend>
    <textarea name="${name}" hidden>${escapeHtml(value)}</textarea>
    <div data-rows>${rows.map((line) => structuredRow(name, line)).join('')}</div>
    ${singles.has(name) || name === 'sections' ? '' : '<button type="button" class="owner-row-add" data-row-add>Add item</button>'}</fieldset>`;
}

export function structuredRow(name: string, line = ''): string {
  const columns = layouts[name] ?? [];
  const values = columns.length === 1 ? [line.trim()] : line.split('|').map((part) => part.trim());
  return `<div class="owner-structured-row">${columns.map((label, index) => {
    const value = values[index] ?? '';
    if (name === 'sections' && index === 0) return `<span class="owner-section-name">${escapeHtml(value)}</span><input data-cell type="hidden" value="${escapeHtml(value)}">`;
    if (name === 'sections' && index === 2) return `<label class="owner-toggle"><input data-cell type="checkbox"${value === 'true' ? ' checked' : ''}> Show this section</label>`;
    return `<label>${escapeHtml(label)}<input data-cell type="text" value="${escapeHtml(value)}"${label === 'Destination' ? ' placeholder="#contact or qortal://…"' : ''}></label>`;
  }).join('')}${singles.has(name) || name === 'sections' ? '' : '<button type="button" class="owner-row-remove" data-row-remove aria-label="Remove item">Remove</button>'}</div>`;
}

export function syncStructured(form: HTMLElement): void {
  for (const group of form.querySelectorAll<HTMLElement>('[data-structured]')) {
    const name = group.dataset.structured ?? '';
    const rows = [...group.querySelectorAll<HTMLElement>('.owner-structured-row')].map((row) =>
      [...row.querySelectorAll<HTMLInputElement>('[data-cell]')].map((input) =>
        input.type === 'checkbox' ? String(input.checked) : input.value,
      ).join((layouts[name]?.length ?? 0) > 1 ? ' | ' : ''),
    ).filter((line) => line.replace(/[|\s]/g, '') !== '');
    const hidden = group.querySelector<HTMLTextAreaElement>('textarea[name]');
    if (hidden) hidden.value = rows.join(name === 'categories' || name === 'tags' ? ', ' : '\n');
  }
}
