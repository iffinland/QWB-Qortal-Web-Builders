/**
 * Scroll-to-top button. The published site duplicated the same ~20 lines of
 * inline script on all six pages and styled the button off-palette red; the
 * affordance is preserved here with the identity colours and an accessible name
 * (set in index.html), and it stays hidden until the page is scrolled.
 */
export function mountScrollToTop(): void {
  const button = document.getElementById('to-top');
  if (!(button instanceof HTMLButtonElement)) return;

  const syncVisibility = (): void => {
    button.hidden = window.scrollY <= 20;
  };

  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  syncVisibility();
  window.addEventListener('scroll', syncVisibility, { passive: true });
}
