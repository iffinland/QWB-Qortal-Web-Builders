/**
 * Skip link.
 *
 * The app resolves every hash as a route, so a plain `<a href="#main-content">`
 * would send `#main-content` to the router and replace the current page with the
 * not-found view. The click is intercepted instead: focus moves to the main
 * region (made programmatically focusable) and the hash is left untouched.
 *
 * `main-content` is in the router's reserved-hash set as well, so an externally
 * set `#main-content` cannot replace the page either.
 */

export const MAIN_CONTENT_ID = 'main-content';

/** Hashes that are in-page focus targets, never view routes. */
export const RESERVED_FOCUS_HASHES: readonly string[] = [`#${MAIN_CONTENT_ID}`];

/** Moves focus to the main region without changing the URL hash. */
export function focusMainContent(): boolean {
  const main = document.getElementById(MAIN_CONTENT_ID);
  if (main === null) return false;
  main.setAttribute('tabindex', '-1');
  main.focus();
  return true;
}

export function mountSkipLink(): void {
  const link = document.querySelector<HTMLAnchorElement>('.skip-link');
  if (link === null) return;

  link.addEventListener('click', (event) => {
    if (!focusMainContent()) return;
    event.preventDefault();
  });
}
