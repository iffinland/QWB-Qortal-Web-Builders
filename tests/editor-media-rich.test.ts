import { describe, expect, it } from 'vitest';
import { snapshotFile } from '../src/owner/file-snapshot';
import { sanitizeRichText } from '../src/owner/rich-text';

describe('editor media and rich text', () => {
  it('copies selected file bytes immediately into an independently readable file', async () => {
    const original = new File(['test bytes'], 'image.png', { type: 'image/png' });
    const snapshot = await snapshotFile(original);
    expect(snapshot).not.toBe(original);
    expect(snapshot.name).toBe(original.name);
    expect(snapshot.type).toBe(original.type);
    const read = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.readAsText(snapshot);
    });
    expect(read).toBe('test bytes');
  });
  it('keeps formatting and Qortal links while stripping executable content', () => {
    const html = sanitizeRichText('<p><b>Bold</b><a href="qortal://APP/Q-Mail">Mail</a><a href="javascript:alert(1)">bad</a><img src=x onerror=alert(1)><script>alert(1)</script></p>');
    expect(html).toContain('<b>Bold</b>');
    expect(html).toContain('href="qortal://APP/Q-Mail"');
    expect(html).not.toMatch(/javascript:|onerror|<script|<img/);
  });
});
