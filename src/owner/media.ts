/**
 * Content-image pipeline.
 *
 * Content images are QDN-managed (audit D3): the app bundles brand/structural
 * assets only, and every editable image is downscaled in the frame, encoded, and
 * published as its own resource under the **owning entity's identifier** (§6.1).
 *
 * Why the frame downscales instead of publishing the original: a phone photo is
 * several MB, the `THUMBNAIL` service accepts 500 KB, and base64 of a large file
 * is memory-expensive in a render frame. The encoder therefore targets a bounded
 * long edge and re-encodes to WebP, falling back to JPEG where WebP encoding is
 * unavailable. If the result still exceeds the image limit, the publish pipeline
 * refuses it with a truthful error rather than sending an unusable resource.
 *
 * The encoder is an injected interface so the publish flow can be tested without
 * a canvas: jsdom has no image decoder, and mocking the whole DOM would test the
 * mock rather than the pipeline.
 */

import { IMAGE_MAX_BYTES, THUMBNAIL_MAX_BYTES } from '../qortal/publish';

/** Long-edge bound for an encoded content image. */
export const DEFAULT_MAX_EDGE = 1200;
export const DEFAULT_QUALITY = 0.82;

export const ACCEPTED_IMAGE_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;

export interface EncodedImage {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly filename: string;
  readonly width: number;
  readonly height: number;
}

export interface ImageEncoder {
  encode(file: File | Blob): Promise<EncodedImage>;
}

export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

/** Scales `width`×`height` down so the longest edge is at most `maxEdge`. */
export function targetDimensions(width: number, height: number, maxEdge: number): Dimensions {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function filenameFor(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'cover.png';
    case 'image/jpeg':
      return 'cover.jpg';
    default:
      return 'cover.webp';
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The service an encoded image will be published to, for the form's own wording. */
export function describeMediaTarget(byteLength: number): string {
  if (byteLength <= THUMBNAIL_MAX_BYTES) {
    return `THUMBNAIL (${formatBytes(byteLength)} of the ${formatBytes(THUMBNAIL_MAX_BYTES)} limit)`;
  }
  if (byteLength <= IMAGE_MAX_BYTES) {
    return `IMAGE (${formatBytes(byteLength)}, above the ${formatBytes(THUMBNAIL_MAX_BYTES)} thumbnail limit)`;
  }
  return `too large: ${formatBytes(byteLength)} exceeds the ${formatBytes(IMAGE_MAX_BYTES)} image limit`;
}

export function isAcceptedImageType(mimeType: string): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mimeType);
}

function encodeWithCanvas(
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) {
      reject(new Error('this browser could not provide a 2D canvas context'));
      return;
    }
    context.drawImage(source, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error(`this browser cannot encode ${mimeType}`));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

export interface BrowserEncoderOptions {
  readonly maxEdge?: number;
  readonly quality?: number;
}

/**
 * Real encoder: decode → downscale → WebP (JPEG fallback).
 *
 * PNG input is re-encoded to WebP so the published bytes stay small; the served
 * filename follows the actual encoded type, because the node derives the MIME
 * type from it.
 */
export const browserImageEncoder: ImageEncoder = {
  async encode(file, options: BrowserEncoderOptions = {}) {
    const declared = file.type === '' ? 'image/webp' : file.type;
    if (!isAcceptedImageType(declared)) {
      throw new Error(
        `images must be WebP, JPEG or PNG (received ${declared === '' ? 'an unknown type' : declared})`,
      );
    }

    const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
    const quality = options.quality ?? DEFAULT_QUALITY;
    const bitmap = await createImageBitmap(file);
    try {
      const target = targetDimensions(bitmap.width, bitmap.height, maxEdge);
      let blob: Blob;
      let mimeType = 'image/webp';
      try {
        blob = await encodeWithCanvas(bitmap, target.width, target.height, mimeType, quality);
      } catch {
        mimeType = 'image/jpeg';
        blob = await encodeWithCanvas(bitmap, target.width, target.height, mimeType, quality);
      }
      return {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mimeType,
        filename: filenameFor(mimeType),
        width: target.width,
        height: target.height,
      };
    } finally {
      bitmap.close();
    }
  },
};
