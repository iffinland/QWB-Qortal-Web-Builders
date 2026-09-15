/**
 * The content-image pipeline helpers.
 *
 * The encoder itself needs a canvas (jsdom has none), so the pure planning pieces
 * are tested here: the target size, the served filename, the service an encoded
 * image will land in and the wording the form uses to describe that. The publish
 * side of the pipeline is covered by `tests/qdn-publish.test.ts` and the owner flow
 * by `tests/owner-flows.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_IMAGE_TYPES,
  DEFAULT_MAX_EDGE,
  browserImageEncoder,
  describeMediaTarget,
  filenameFor,
  formatBytes,
  isAcceptedImageType,
  targetDimensions,
} from '../src/owner/media';
import { IMAGE_MAX_BYTES, THUMBNAIL_MAX_BYTES } from '../src/qortal/publish';

describe('targetDimensions', () => {
  it('scales the long edge down without upscaling', () => {
    expect(targetDimensions(2400, 1200, 1200)).toEqual({ width: 1200, height: 600 });
    expect(targetDimensions(1200, 2400, 1200)).toEqual({ width: 600, height: 1200 });
    expect(targetDimensions(600, 300, 1200)).toEqual({ width: 600, height: 300 });
  });

  it('rounds and never produces a zero dimension', () => {
    expect(targetDimensions(4000, 1, 1200)).toEqual({ width: 1200, height: 1 });
    expect(targetDimensions(0, 0, 1200)).toEqual({ width: 1, height: 1 });
    expect(targetDimensions(-5, 100, 1200)).toEqual({ width: 1, height: 1 });
  });

  it('uses a bounded default long edge', () => {
    expect(DEFAULT_MAX_EDGE).toBeGreaterThan(0);
    expect(targetDimensions(10_000, 10_000, DEFAULT_MAX_EDGE).width).toBe(DEFAULT_MAX_EDGE);
  });
});

describe('served filenames and service choice', () => {
  it('names the file after the encoded type', () => {
    expect(filenameFor('image/png')).toBe('cover.png');
    expect(filenameFor('image/jpeg')).toBe('cover.jpg');
    expect(filenameFor('image/webp')).toBe('cover.webp');
    expect(filenameFor('image/gif')).toBe('cover.webp');
  });

  it('accepts only the three types the node can serve as an image', () => {
    for (const type of ACCEPTED_IMAGE_TYPES) expect(isAcceptedImageType(type)).toBe(true);
    expect(isAcceptedImageType('image/gif')).toBe(false);
    expect(isAcceptedImageType('application/pdf')).toBe(false);
    expect(isAcceptedImageType('')).toBe(false);
  });

  it('describes the service the encoded image will be published to', () => {
    expect(describeMediaTarget(1024)).toContain('THUMBNAIL');
    expect(describeMediaTarget(THUMBNAIL_MAX_BYTES)).toContain('THUMBNAIL');
    expect(describeMediaTarget(THUMBNAIL_MAX_BYTES + 1)).toContain('IMAGE');
    expect(describeMediaTarget(THUMBNAIL_MAX_BYTES + 1)).toContain('above the');
    expect(describeMediaTarget(IMAGE_MAX_BYTES + 1)).toContain('too large');
    expect(describeMediaTarget(IMAGE_MAX_BYTES + 1)).toContain('exceeds');
  });

  it('formats byte sizes for the owner', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('browserImageEncoder', () => {
  it('refuses a type the node cannot serve before decoding anything', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'animation.gif', { type: 'image/gif' });
    await expect(browserImageEncoder.encode(file)).rejects.toThrow(/WebP, JPEG or PNG/);
  });
});
