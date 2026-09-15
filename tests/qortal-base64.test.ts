/**
 * base64 for publish payloads.
 *
 * The reference app used `btoa(unescape(encodeURIComponent(text)))`, which is
 * deprecated and mangles anything outside Latin-1. These tests pin that the app
 * encodes real UTF-8 bytes, so emoji and non-Latin content survive a publish.
 */

import { describe, expect, it } from 'vitest';

import {
  base64ByteLength,
  bytesToBase64,
  normalizeBase64,
  stripDataUrlPrefix,
  textToBase64,
} from '../src/qortal/base64';

function decode(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

describe('bytesToBase64', () => {
  it('encodes arbitrary bytes', () => {
    expect(bytesToBase64(new Uint8Array([0, 1, 2, 253, 254, 255]))).toBe(
      btoa(String.fromCharCode(0, 1, 2, 253, 254, 255)),
    );
    expect(bytesToBase64(new Uint8Array([]))).toBe('');
  });

  it('survives a payload larger than the argument-spread limit', () => {
    const bytes = new Uint8Array(200_000).map((_, index) => index % 251);
    const decoded = atob(bytesToBase64(bytes));
    expect(decoded.length).toBe(bytes.length);
    expect(decoded.charCodeAt(199_999)).toBe(bytes[199_999]);
  });
});

describe('textToBase64', () => {
  it('round-trips non-Latin-1 text that the deprecated recipe would corrupt', () => {
    for (const text of ['ä ö õ ü', 'Üzbеk — eesti', '日本語のテキスト', 'emoji 🎨🚀']) {
      expect(decode(textToBase64(text))).toBe(text);
    }
  });

  it('round-trips a JSON entity byte for byte', () => {
    const entity = { title: 'Tere tulemast — “Qortal Web Builders” 🎨', order: 10, rev: 3 };
    expect(JSON.parse(decode(textToBase64(JSON.stringify(entity))))).toEqual(entity);
  });
});

describe('stripDataUrlPrefix', () => {
  it('removes a data URL prefix and leaves bare base64 alone', () => {
    expect(stripDataUrlPrefix('data:image/webp;base64,AAAA')).toBe('AAAA');
    expect(stripDataUrlPrefix('AAAA')).toBe('AAAA');
    expect(stripDataUrlPrefix('data:image/webp;base64,')).toBe('');
  });
});

describe('normalizeBase64', () => {
  it('treats whitespace, padding and the URL-safe alphabet as the same bytes', () => {
    const canonical = bytesToBase64(new Uint8Array([251, 255, 190, 1]));
    expect(canonical).toContain('+');
    expect(normalizeBase64(canonical)).toBe(normalizeBase64(canonical.replace(/\+/, '-')));
    expect(normalizeBase64(`${canonical}\n`)).toBe(normalizeBase64(canonical));
    expect(normalizeBase64(canonical.replace(/=+$/, ''))).toBe(normalizeBase64(canonical));
  });

  it('never maps two different payloads onto one normalization', () => {
    const a = normalizeBase64(bytesToBase64(new Uint8Array([1, 2, 3])));
    const b = normalizeBase64(bytesToBase64(new Uint8Array([1, 2, 4])));
    expect(a).not.toBe(b);
  });
});

describe('base64ByteLength', () => {
  it('counts decoded bytes, not characters', () => {
    expect(base64ByteLength('')).toBe(0);
    // One byte encodes to two characters plus padding.
    expect(base64ByteLength(textToBase64('a'))).toBe(1);
    expect(base64ByteLength(textToBase64('ab'))).toBe(2);
    expect(base64ByteLength(textToBase64('abc'))).toBe(3);
  });

  it('reports the byte length of a large payload', () => {
    const bytes = new Uint8Array(200_000).map((_, index) => index % 251);
    const encoded = bytesToBase64(bytes);
    expect(encoded.length).toBeGreaterThan(bytes.length);
    expect(base64ByteLength(encoded)).toBe(bytes.length);
  });
});
