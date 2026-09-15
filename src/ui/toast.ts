/**
 * Owner-facing status toasts.
 *
 * `textContent` only: a toast never renders content-derived markup. Toasts carry
 * truthful outcome wording (see `src/qortal/write.ts`) — they are the app's
 * confirmation surface, and the audit's rule is that nothing may be shown as
 * saved/published before the host has been read back.
 */

export type ToastTone = 'info' | 'warning';

export interface ToastOptions {
  readonly tone?: ToastTone;
  readonly durationMs?: number;
}

export const TOAST_HOST_ID = 'qwb-toast-host';
const DEFAULT_DURATION_MS = 6000;
const WARNING_DURATION_MS = 9000;

function ensureHost(): HTMLElement {
  const existing = document.getElementById(TOAST_HOST_ID);
  if (existing !== null) return existing;
  const host = document.createElement('div');
  host.id = TOAST_HOST_ID;
  host.className = 'qwb-toast-host';
  // The tray is a polite live region: it must never steal focus.
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.append(host);
  return host;
}

export function showToast(message: string, options: ToastOptions = {}): void {
  const tone = options.tone ?? 'info';
  const durationMs =
    options.durationMs ?? (tone === 'warning' ? WARNING_DURATION_MS : DEFAULT_DURATION_MS);
  const host = ensureHost();

  const toast = document.createElement('div');
  toast.className = `qwb-toast qwb-toast-${tone}`;

  const text = document.createElement('span');
  text.className = 'qwb-toast-text';
  text.textContent = message;

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'qwb-toast-dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss this message');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => {
    toast.remove();
  });

  toast.append(text, dismiss);
  host.append(toast);

  if (durationMs > 0) {
    setTimeout(() => {
      toast.remove();
    }, durationMs);
  }
}

export function clearToasts(): void {
  document.getElementById(TOAST_HOST_ID)?.replaceChildren();
}
