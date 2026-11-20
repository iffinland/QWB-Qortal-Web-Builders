import { describe, expect, it } from 'vitest';

import { qdnMediaUrl, resolveImageUrl, videoUrl, isQdnAbsolutePath } from '../src/content/media';
import type { ImageRef } from '../src/content/schema';
import { placeholderCover } from '../src/ui/placeholder';
import { isSafeHref } from '../src/ui/html';

describe('media reference resolution', () => {
  it('builds absolute /arbitrary paths for QDN images', () => {
    const ref: ImageRef = {
      source: 'qdn',
      service: 'THUMBNAIL',
      name: 'Qortal Web Builders',
      identifier: 'qwb_work_asot-abc-1',
      filename: 'cover.jpg',
      alt: 'cover',
    };
    const url = qdnMediaUrl(ref);
    expect(url).toBe('/arbitrary/THUMBNAIL/Qortal%20Web%20Builders/qwb_work_asot-abc-1');
    expect(isQdnAbsolutePath(url)).toBe(true);
  });

  it('builds absolute video paths under the VIDEO service', () => {
    const url = videoUrl({
      name: 'Qortal Web Builders',
      identifier: 'qwb_work_demo-1',
      filename: 'demo.mp4',
      title: 'Demo',
    });
    expect(url).toBe('/arbitrary/VIDEO/Qortal%20Web%20Builders/qwb_work_demo-1');
  });

  it('never returns a relative path for QDN media', () => {
    const url = resolveImageUrl(
      { source: 'qdn', service: 'IMAGE', name: 'n', identifier: 'i', filename: 'f.png', alt: 'a' },
      placeholderCover,
    );
    expect(url.startsWith('/arbitrary/')).toBe(true);
  });

  it('renders placeholders as escaped SVG data URIs', () => {
    const cover = placeholderCover('<script>alert(1)</script>');
    expect(cover.startsWith('data:image/svg+xml')).toBe(true);
    expect(cover).not.toContain('<script>');
  });

  it('only treats in-app hashes and qortal:// links as safe', () => {
    expect(isSafeHref('#/work/a')).toBe(true);
    expect(isSafeHref('qortal://APP/Q-Mail')).toBe(true);
    expect(isSafeHref('https://example.org')).toBe(false);
  });
});
