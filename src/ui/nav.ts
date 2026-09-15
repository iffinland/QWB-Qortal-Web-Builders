/**
 * Navbar behaviour, reimplemented without jQuery or the Bootstrap JS bundle:
 *  - the mobile collapse toggles the `show` class Bootstrap's CSS expects;
 *  - the navbar is sticky and adopts the theme's intended scrolled state
 *    (`.navbar.is-scrolled`), which the published build never reached because
 *    its sticky plugin was never initialised;
 *  - the home page's scroll-spy highlights the section currently in view.
 *
 * `mountNavbar` returns a teardown so a re-render on navigation cannot stack
 * duplicate listeners (the published site's jQuery handlers were re-bound on
 * every inline script copy).
 */

export interface NavOptions {
  readonly scrollSpySectionIds?: readonly string[];
}

export function mountNavbar(options: NavOptions = {}): () => void {
  const navbar = document.getElementById('site-navbar');
  if (navbar === null) return () => undefined;

  const teardowns: (() => void)[] = [];
  const toggler = navbar.querySelector<HTMLButtonElement>('.navbar-toggler');
  const collapse = navbar.querySelector<HTMLElement>('.navbar-collapse');

  if (toggler !== null && collapse !== null) {
    const setExpanded = (expanded: boolean): void => {
      toggler.setAttribute('aria-expanded', String(expanded));
      collapse.classList.toggle('show', expanded);
    };

    const onToggle = (): void => {
      setExpanded(toggler.getAttribute('aria-expanded') !== 'true');
    };
    const onCollapseClick = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest('a') !== null) setExpanded(false);
    };
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && toggler.getAttribute('aria-expanded') === 'true') {
        setExpanded(false);
        toggler.focus();
      }
    };

    toggler.addEventListener('click', onToggle);
    collapse.addEventListener('click', onCollapseClick);
    document.addEventListener('keydown', onKeydown);
    teardowns.push(() => {
      toggler.removeEventListener('click', onToggle);
      collapse.removeEventListener('click', onCollapseClick);
      document.removeEventListener('keydown', onKeydown);
    });
  }

  const sectionIds = options.scrollSpySectionIds ?? [];
  const onScroll = (): void => {
    navbar.classList.toggle('is-scrolled', window.scrollY > 20);
    if (sectionIds.length > 0) updateActiveLink(sectionIds);
  };

  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  teardowns.push(() => window.removeEventListener('scroll', onScroll));

  return () => teardowns.forEach((teardown) => teardown());
}

function updateActiveLink(sectionIds: readonly string[]): void {
  const navLinks = document.querySelectorAll<HTMLAnchorElement>('#site-navbar .nav-link');
  let currentId = '';

  for (const id of sectionIds) {
    const section = document.getElementById(id);
    if (section === null) continue;
    if (section.getBoundingClientRect().top <= 140) currentId = id;
  }

  navLinks.forEach((link) => {
    const isActive = currentId !== '' && link.getAttribute('href') === `#${currentId}`;
    link.classList.toggle('active', isActive);
    if (isActive) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
}
