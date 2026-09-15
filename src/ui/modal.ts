/**
 * Modal manager (owner UI only).
 *
 * One host element, one backdrop, one focus trap. Responsibilities the audit
 * asked for explicitly (approved proposal §9.2/§9.3):
 *
 *  - `role="dialog"` + `aria-modal` + `aria-labelledby`, focus moved into the
 *    dialog on open and restored to the invoking control on close;
 *  - Escape cancels, but a **dirty** dialog asks before discarding;
 *  - backdrop click closes only through the same dirty guard;
 *  - the destructive/primary actions are the caller's markup, so the caller
 *    controls what is disabled — this module never decides an outcome.
 *
 * `bodyHtml`/`footerHtml` are inserted as HTML: callers must escape every
 * content-derived value (`src/ui/html.ts`) before passing it in. Nothing in this
 * module accepts a plain-text argument that ends up in `innerHTML`.
 */

export interface ModalOptions {
  readonly title: string;
  readonly bodyHtml: string;
  readonly footerHtml?: string;
  readonly subtitle?: string;
  /** Called before closing through Escape/backdrop/close-button. */
  readonly dirty?: () => boolean;
  readonly discardPrompt?: string;
  readonly onClose?: () => void;
}

export interface ModalHandle {
  readonly root: HTMLElement;
  readonly body: HTMLElement;
  readonly footer: HTMLElement;
  /** Closes immediately, bypassing the dirty guard (used after a decision). */
  close(): void;
  /** Escape/backdrop semantics: honours the dirty guard. */
  requestClose(): void;
  open: boolean;
}

export const MODAL_HOST_ID = 'qwb-modal-host';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const DEFAULT_DISCARD_PROMPT = 'Discard the changes in this form?';

let openModals = 0;
let idCounter = 0;
/**
 * Every open dialog's teardown. A dialog attaches a capturing `keydown` listener
 * to `document`; without this registry `closeAllModals()` (used when the page
 * shell is torn down) would remove the DOM and leave the listener behind, so a
 * removed dialog would keep trapping Tab and Escape.
 */
const openDialogs = new Set<(restoreFocus: boolean) => void>();

function ensureHost(): HTMLElement {
  const existing = document.getElementById(MODAL_HOST_ID);
  if (existing !== null) return existing;
  const host = document.createElement('div');
  host.id = MODAL_HOST_ID;
  host.className = 'qwb-modal-host';
  document.body.append(host);
  return host;
}

function lockScroll(): void {
  openModals += 1;
  document.documentElement.classList.add('qwb-modal-open');
}

function unlockScroll(): void {
  openModals = Math.max(0, openModals - 1);
  if (openModals === 0) document.documentElement.classList.remove('qwb-modal-open');
}

function mustFind<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`missing modal element: ${selector}`);
  return element;
}

/**
 * Hidden means "inside a `[hidden]` subtree or explicitly `hidden`". Layout-based
 * checks (`offsetParent`) are deliberately avoided: they are false for every
 * element in a non-laid-out document, which would silently disable the focus
 * trap (and make the guard's own buttons part of the Tab cycle).
 */
function isVisible(element: HTMLElement): boolean {
  if (element.hasAttribute('hidden')) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;
  return element.closest('[hidden]') === null;
}

function focusableWithin(root: HTMLElement): readonly HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

export function openModal(options: ModalOptions): ModalHandle {
  const host = ensureHost();
  const previouslyFocused = document.activeElement;
  const titleId = `qwb-modal-title-${String((idCounter += 1))}`;

  const backdrop = document.createElement('div');
  backdrop.className = 'qwb-modal-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'qwb-modal';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.tabIndex = -1;

  const subtitle =
    options.subtitle === undefined ? '' : `<p class="qwb-modal-subtitle">${options.subtitle}</p>`;

  dialog.innerHTML = `<header class="qwb-modal-header">
  <div>
    <h2 id="${titleId}" class="qwb-modal-title">${options.title}</h2>
    ${subtitle}
  </div>
  <button type="button" class="qwb-modal-close" data-qwb-modal-close aria-label="Close this dialog">&#215;</button>
</header>
<div class="qwb-modal-body" data-qwb-modal-body>${options.bodyHtml}</div>
<footer class="qwb-modal-footer" data-qwb-modal-footer>${options.footerHtml ?? ''}</footer>
<div class="qwb-modal-guard" data-qwb-modal-guard hidden>
  <p class="mb-2">${options.discardPrompt ?? DEFAULT_DISCARD_PROMPT}</p>
  <div class="qwb-modal-guard-actions">
    <button type="button" class="qwb-btn qwb-btn-quiet" data-qwb-modal-keep>Keep editing</button>
    <button type="button" class="qwb-btn qwb-btn-danger" data-qwb-modal-discard>Discard changes</button>
  </div>
</div>`;

  backdrop.append(dialog);
  host.append(backdrop);
  lockScroll();

  const body = mustFind<HTMLElement>(dialog, '[data-qwb-modal-body]');
  const footer = mustFind<HTMLElement>(dialog, '[data-qwb-modal-footer]');
  const guard = mustFind<HTMLElement>(dialog, '[data-qwb-modal-guard]');

  const handle: ModalHandle = {
    root: dialog,
    body,
    footer,
    open: true,
    close() {
      dispose(true);
    },
    requestClose() {
      if (!handle.open) return;
      if (guard.hidden && options.dirty?.() === true) {
        guard.hidden = false;
        mustFind<HTMLElement>(guard, '[data-qwb-modal-keep]').focus();
        return;
      }
      handle.close();
    },
  };

  /**
   * The single teardown path. `restoreFocus` is `false` when the whole modal host
   * is being emptied: the invoking control may already be gone, and stealing
   * focus during teardown is worse than leaving it where it is.
   */
  function dispose(restoreFocus: boolean): void {
    if (!handle.open) return;
    handle.open = false;
    openDialogs.delete(dispose);
    backdrop.remove();
    unlockScroll();
    document.removeEventListener('keydown', onKeydown, true);
    options.onClose?.();
    if (
      restoreFocus &&
      previouslyFocused instanceof HTMLElement &&
      document.contains(previouslyFocused)
    ) {
      previouslyFocused.focus();
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (!handle.open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!guard.hidden) {
        guard.hidden = true;
        dialog.focus();
        return;
      }
      handle.requestClose();
      return;
    }

    if (event.key !== 'Tab') return;
    const items = focusableWithin(dialog);
    if (items.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) handle.requestClose();
  });
  mustFind<HTMLElement>(dialog, '[data-qwb-modal-close]').addEventListener('click', () => {
    handle.requestClose();
  });
  /*
   * `data-qwb-modal-cancel` is the module's own contract for a footer cancel
   * button, so a caller cannot ship one that looks like cancel and does nothing.
   * It goes through `requestClose()`, i.e. the same dirty guard as Escape.
   */
  dialog.querySelectorAll<HTMLElement>('[data-qwb-modal-cancel]').forEach((element) => {
    element.addEventListener('click', () => {
      handle.requestClose();
    });
  });
  mustFind<HTMLElement>(guard, '[data-qwb-modal-discard]').addEventListener('click', () => {
    handle.close();
  });
  mustFind<HTMLElement>(guard, '[data-qwb-modal-keep]').addEventListener('click', () => {
    guard.hidden = true;
    dialog.focus();
  });

  document.addEventListener('keydown', onKeydown, true);
  openDialogs.add(dispose);
  dialog.focus();

  return handle;
}

/**
 * Closes every open dialog and releases everything they attached (used when the
 * page shell is re-rendered or torn down).
 */
export function closeAllModals(): void {
  const disposers = [...openDialogs];
  openDialogs.clear();
  for (const dispose of disposers) dispose(false);
  const host = document.getElementById(MODAL_HOST_ID);
  host?.replaceChildren();
  openModals = 0;
  document.documentElement.classList.remove('qwb-modal-open');
}

export function activeModalCount(): number {
  return document.querySelectorAll(`#${MODAL_HOST_ID} .qwb-modal`).length;
}
