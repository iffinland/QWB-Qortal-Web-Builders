import { describe, expect, it } from 'vitest';
import { structuredControl, syncStructured } from '../src/owner/controls';

describe('friendly owner controls', () => {
  it('serializes edited navigation rows for the existing validated form model', () => {
    const root = document.createElement('form');
    root.innerHTML = structuredControl('nav', 'Navigation', 'Services | #services\nContact | #contact') ?? '';
    const inputs = root.querySelectorAll<HTMLInputElement>('[data-cell]');
    inputs[0]!.value = 'Our services';
    syncStructured(root);
    expect(root.querySelector('textarea')?.value).toBe('Our services | #services\nContact | #contact');
  });

  it('keeps section ids fixed while converting visibility switches to stored values', () => {
    const root = document.createElement('form');
    root.innerHTML = structuredControl('sections', 'Sections', 'hero | Home | true') ?? '';
    root.querySelector<HTMLInputElement>('[type="checkbox"]')!.checked = false;
    syncStructured(root);
    expect(root.querySelector('textarea')?.value).toBe('hero | Home | false');
    expect(root.querySelector<HTMLInputElement>('[data-cell]')?.type).toBe('hidden');
  });
});
