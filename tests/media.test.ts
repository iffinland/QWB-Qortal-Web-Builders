import { describe, expect, it } from 'vitest';

import { isQdnAbsolutePath, qdnMediaUrl, resolveImageUrl } from '../src/content/media';
import type { ImageRef } from '../src/content/schema';
import { placeholderCover } from '../src/ui/placeholder';
import { isSafeHref } from '../src/ui/html';

describe('media reference resolution', () => {
  it('builds absolute /arbitrary paths for QDN media', () => {
    const ref: ImageRef = {
      source: 'qdn',
      service: 'THUMBNAIL',
      name: 'Qortal Web Builders',
      identifier: 'qwb_work_asot-abc-1',
      filename: 'cover.jpg',
      alt: 'cover',
    };
    const url = qdnMediaUrl(ref);
    expect(url).toBe('/arbitrary/THUMBNAIL/Qortal%20Web%20Builders/qwb_work_asot-abc-1/cover.jpg');
    expect(isQdnAbsolutePath(url)).toBe(true);
  });

  it('never returns a relative path for QDN media', () => {
    const url = resolveImageUrl(
      {
        source: 'qdn',
        service: 'IMAGE',
        name: 'n',
        identifier: 'i',
        filename: 'f.png',
        alt: 'a',
      },
      placeholderCover,
    );
    expect(url.startsWith('/arbitrary/')).toBe(true);
  });

  it('resolves bundled assets to their Vite URL and placeholders to an SVG data URI', () => {
    const bundled = resolveImageUrl(
      { source: 'bundled', src: '/assets/x.png', alt: 'x' },
      placeholderCover,
    );
    expect(bundled).toBe('/assets/x.png');

    const placeholder = resolveImageUrl(
      { source: 'placeholder', label: 'ASOT', alt: 'ASOT' },
      placeholderCover,
    );
    expect(placeholder.startsWith('data:image/svg+xml')).toBe(true);
  });
});

describe('placeholder covers', () => {
  it('is deterministic and distinct per label', () => {
    expect(placeholderCover('ASOT')).toBe(placeholderCover('ASOT'));
    expect(placeholderCover('ASOT')).not.toBe(placeholderCover('iffi vaba mees'));
  });

  it('keeps the card framing and escapes the label', () => {
    const uri = placeholderCover('Tom & "Jerry" <preview>');
    expect(uri).toContain('viewBox%3D%220%200%201200%20675%22');
    expect(decodeURIComponent(uri)).not.toContain('<preview>');
    expect(decodeURIComponent(uri)).toContain('&amp;');
  });
});

describe('link safety', () => {
  it('only allows hash routes and qortal deep links', () => {
    expect(isSafeHref('#/works')).toBe(true);
    expect(isSafeHref('qortal://WEBSITE/Qortal%20Web%20Builders')).toBe(true);
    expect(isSafeHref('https://qortal.org')).toBe(false);
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
  });
});
