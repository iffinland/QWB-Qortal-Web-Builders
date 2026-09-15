import type { ImageRef } from '../content/schema';
import { resolveImageUrl } from '../content/media';
import { escapeHtml, classNames } from './html';
import { placeholderCover } from './placeholder';

export interface ImageOptions {
  readonly className?: string;
  readonly width?: number;
  readonly height?: number;
}

export function renderImage(ref: ImageRef, options: ImageOptions = {}): string {
  const src = resolveImageUrl(ref, placeholderCover);
  const classes = classNames(options.className);
  // No `loading="lazy"` here: the published site loaded every image eagerly, the
  // Phase-1 payload is tiny (bundled illustrations + inline placeholder covers),
  // and lazy images below the fold do not survive a deterministic full-page
  // capture. Revisit lazily loading when Phase 3 serves real QDN media.
  const attributes = [
    `src="${escapeHtml(src)}"`,
    `alt="${escapeHtml(ref.alt)}"`,
    classes === '' ? '' : `class="${classes}"`,
    options.width === undefined ? '' : `width="${options.width}"`,
    options.height === undefined ? '' : `height="${options.height}"`,
  ]
    .filter((value) => value !== '')
    .join(' ');

  return `<img ${attributes}>`;
}
