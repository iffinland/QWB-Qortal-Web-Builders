import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { activeModalCount, closeAllModals, openModal } from '../src/ui/modal';

function key(key: string, options: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  closeAllModals();
});

describe('modal shell', () => {
  it('is a labelled modal dialog that moves focus into itself', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();

    const handle = openModal({ title: 'Edit project', bodyHtml: '<p>body</p>' });

    expect(handle.root.getAttribute('role')).toBe('dialog');
    expect(handle.root.getAttribute('aria-modal')).toBe('true');
    expect(handle.root.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.activeElement).toBe(handle.root);
    expect(document.body.textContent).toContain('Edit project');

    handle.close();
  });

  it('restores focus to the invoking control on close', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();

    const handle = openModal({ title: 'Edit', bodyHtml: '<p>x</p>' });
    handle.close();

    expect(document.activeElement).toBe(trigger);
  });

  it('keeps Tab inside the dialog', () => {
    const handle = openModal({
      title: 'Edit',
      bodyHtml: '<input name="a"><input name="b">',
      footerHtml: '<button type="button">Save</button>',
    });

    // The dirty-guard buttons live in the same dialog but inside `[hidden]`, so
    // they must not take part in the Tab cycle.
    const focusables = handle.root.querySelectorAll<HTMLElement>(
      '.qwb-modal-header button, .qwb-modal-body input, .qwb-modal-footer button',
    );
    const last = focusables[focusables.length - 1];
    if (last === undefined) throw new Error('no focusable controls');
    last.focus();
    key('Tab');
    expect(document.activeElement).toBe(focusables[0]);

    const first = focusables[0];
    if (first === undefined) throw new Error('no first control');
    first.focus();
    key('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(last);

    handle.close();
  });

  it('closes on Escape', () => {
    const handle = openModal({ title: 'Edit', bodyHtml: '<p>x</p>' });
    key('Escape');

    expect(handle.open).toBe(false);
    expect(activeModalCount()).toBe(0);
  });

  it('asks before discarding a dirty dialog', () => {
    const handle = openModal({
      title: 'Edit',
      bodyHtml: '<input name="a">',
      dirty: () => true,
    });

    key('Escape');

    expect(handle.open).toBe(true);
    expect(document.body.textContent).toContain('Discard the changes');
    expect(document.activeElement?.getAttribute('data-qwb-modal-keep')).not.toBeNull();
  });

  it('discards after an explicit confirmation and lets "keep editing" return to the form', () => {
    const handle = openModal({ title: 'Edit', bodyHtml: '<input name="a">', dirty: () => true });

    key('Escape');
    const keep = handle.root.querySelector<HTMLButtonElement>('[data-qwb-modal-keep]');
    keep?.click();
    expect(handle.open).toBe(true);
    expect(handle.root.querySelector('[data-qwb-modal-guard]')?.hasAttribute('hidden')).toBe(true);

    key('Escape');
    handle.root.querySelector<HTMLButtonElement>('[data-qwb-modal-discard]')?.click();
    expect(handle.open).toBe(false);
  });

  it('closes from a footer cancel button', () => {
    const handle = openModal({
      title: 'Publishing status',
      bodyHtml: '<p>nothing to do here</p>',
      footerHtml: '<button type="button" data-qwb-modal-cancel>Close</button>',
    });
    const cancel = handle.footer.querySelector<HTMLButtonElement>('[data-qwb-modal-cancel]');
    if (cancel === null) throw new Error('no cancel button');

    cancel.click();

    expect(handle.open).toBe(false);
    expect(document.querySelector('.qwb-modal')).toBeNull();
  });

  it('routes a footer cancel button through the dirty guard', () => {
    const handle = openModal({
      title: 'Edit',
      bodyHtml: '<input name="a">',
      footerHtml: '<button type="button" data-qwb-modal-cancel>Cancel</button>',
      dirty: () => true,
    });
    const cancel = handle.footer.querySelector<HTMLButtonElement>('[data-qwb-modal-cancel]');
    if (cancel === null) throw new Error('no cancel button');

    cancel.click();

    // Still open, and asking — a cancel button must not silently drop the draft.
    expect(handle.open).toBe(true);
    expect(handle.root.textContent).toContain('Discard the changes in this form?');

    handle.close();
  });

  it('releases the document key handler and the scroll lock when every dialog closes at once', () => {
    const first = openModal({ title: 'Edit', bodyHtml: '<input name="a">', dirty: () => true });
    const second = openModal({ title: 'Edit', bodyHtml: '<input name="b">' });
    expect(activeModalCount()).toBe(2);
    expect(document.documentElement.classList.contains('qwb-modal-open')).toBe(true);

    closeAllModals();

    expect(first.open).toBe(false);
    expect(second.open).toBe(false);
    expect(activeModalCount()).toBe(0);
    expect(document.documentElement.classList.contains('qwb-modal-open')).toBe(false);

    // A closed dialog must not keep trapping the document: if its key listener
    // outlived the DOM it would consume Escape/Tab on a page with no dialog.
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });

  it('treats a backdrop click like Escape', () => {
    const handle = openModal({ title: 'Edit', bodyHtml: '<p>x</p>' });
    const backdrop = document.querySelector('.qwb-modal-backdrop');
    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(handle.open).toBe(false);
  });
});
