import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const baseUrl = process.env.QWB_TEST_URL || 'http://127.0.0.1:5173';
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const artifacts = 'test-results';
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(() => {
  window.testStore = JSON.parse(sessionStorage.getItem('testStore') || '{}');
  window.testPublishes = JSON.parse(sessionStorage.getItem('testPublishes') || '[]');
  const resolving = new Set();
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (url, options) => {
    const path = String(url);
    if (path.startsWith('/arbitrary/resources/search')) return new Response(JSON.stringify(Object.keys(window.testStore).map((identifier) => ({ identifier }))));
    if (path.startsWith('/arbitrary/JSON/')) {
      const id = decodeURIComponent(path.split('/')[4].split('?')[0]);
      const value = window.testStore[id];
      return value ? new Response(btoa(unescape(encodeURIComponent(JSON.stringify(value))))) : new Response('', { status: 404 });
    }
    return nativeFetch(url, options);
  };
  window.qortalRequest = async (request) => {
    if (request.action === 'GET_USER_ACCOUNT') return { address: 'QTEST' };
    if (request.action === 'GET_ACCOUNT_NAMES') return [{ name: 'juku' }];
    if (request.action === 'GET_QDN_RESOURCE_STATUS') return { status: 'READY' };
    if (request.action === 'GET_QDN_RESOURCE_URL') {
      if (!resolving.has(request.identifier)) { resolving.add(request.identifier); return 'Resource does not exist'; }
      return `${window.location.origin}/test-qdn/${request.service}/${encodeURIComponent(request.name)}/${request.identifier}`;
    }
    if (request.action === 'PUBLISH_QDN_RESOURCE') {
      if (request.service === 'JSON' && window.testFailNext) {
        window.testFailNext = false;
        throw new Error('Simulated node failure');
      }
      window.testPublishes.push(request);
      if (request.service === 'JSON') window.testStore[request.identifier] = JSON.parse(decodeURIComponent(escape(atob(request.data64))));
      sessionStorage.setItem('testStore', JSON.stringify(window.testStore));
      sessionStorage.setItem('testPublishes', JSON.stringify(window.testPublishes));
      return { signature: 'test-signature' };
    }
    throw new Error('Unexpected request');
  };
});
await page.route('**/test-qdn/**', async (route) => {
  const segments = new URL(route.request().url()).pathname.split('/');
  const bytes = await page.evaluate(({ service, id }) => window.testPublishes.find((item) => item.service === service && item.identifier === id)?.data64, { service: segments[2], id: segments[4] });
  if (!bytes) return route.fulfill({ status: 404, body: 'Missing media' });
  await route.fulfill({ status: 200, contentType: segments[2] === 'VIDEO' ? 'video/mp4' : 'image/png', body: Buffer.from(bytes, 'base64') });
});
await page.goto(`${baseUrl}/render/WEBSITE/juku/`);
const card = page.locator('[data-owner-collection="works"]').first();
await card.locator('[data-action="edit"]').click();
const modal = page.locator('#owner-editor-host');
await modal.waitFor({ state: 'visible' });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64');
await modal.locator('[data-media-field="images"]').setInputFiles([{ name: 'test.png', mimeType: 'image/png', buffer: png }, { name: 'extra.png', mimeType: 'image/png', buffer: png }]);
await page.getByText('Media ready to publish.', { exact: true }).waitFor();
await modal.locator('[data-media-remove-item="images"]').last().click();
await modal.locator('[data-media-remove="images"]').click();
assert.equal(await modal.locator('[data-media-field="images"]').evaluate((el) => el.files.length), 0);
await modal.locator('[data-media-field="images"]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: png });
await page.getByText('Media ready to publish.', { exact: true }).waitFor();
const videoBytes = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x120:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1']);
await modal.locator('[data-media-field="video"]').setInputFiles({ name: 'test.mp4', mimeType: 'video/mp4', buffer: videoBytes });
await page.getByText('Media ready to publish.', { exact: true }).waitFor();
await page.waitForFunction(() => document.querySelector('[data-media-preview="video"] video')?.videoWidth === 160);
await modal.locator('[data-rich-field="description"] [contenteditable]').fill('Formatted project description');
await modal.locator('[data-rich-field="description"] [contenteditable]').press('Control+a');
await modal.locator('[data-rich-field="description"] [data-rich-command="bold"]').click();
await modal.locator('[type="submit"]').click();
await modal.waitFor({ state: 'hidden' });
const publishes = await page.evaluate(() => window.testPublishes);
assert.deepEqual(publishes.map((p) => p.service), ['IMAGE', 'VIDEO', 'JSON']);
assert.equal(publishes[0].data64, png.toString('base64'));
assert.equal(publishes[1].data64, videoBytes.toString('base64'));
let saved = await page.evaluate(() => Object.values(window.testStore)[0]);
assert.match(saved.richText.description, /<(b|strong)>/);
assert.equal(saved.payload.images.length, 1);
assert.ok(saved.payload.video);
await page.evaluate((slug) => { window.location.hash = `#/work/${slug}`; }, saved.payload.slug);
await page.waitForFunction(() => {
  const image = document.querySelector('.work-gallery img');
  const video = document.querySelector('.work-gallery video');
  return image?.naturalWidth > 0 && video?.videoWidth === 160;
});
await page.locator('.work-gallery video').evaluate((video) => video.play());
await page.waitForFunction(() => document.querySelector('.work-gallery video')?.currentTime > 0);
await page.locator('.work-gallery').screenshot({ path: join(artifacts, 'published-media-mobile.png') });
await page.reload();
await page.waitForFunction(() => {
  const image = document.querySelector('.work-gallery img');
  const video = document.querySelector('.work-gallery video');
  return image?.naturalWidth > 0 && video?.videoWidth === 160;
});
await page.evaluate(() => { window.location.hash = '#/'; });
await card.locator('[data-action="edit"]').click();
await modal.locator('[data-media-remove-item="images"]').first().click();
await modal.locator('[data-media-remove="video"]').click();
await page.evaluate(() => { window.testFailNext = true; });
await modal.locator('[type="submit"]').click();
await page.getByText(/Simulated node failure/).waitFor();
await modal.locator('[type="submit"]').click();
await modal.waitFor({ state: 'hidden' });
saved = await page.evaluate(() => Object.values(window.testStore)[0]);
assert.equal(saved.payload.images.length, 0);
assert.equal(saved.payload.video, undefined);
await card.locator('[data-action="edit"]').click();
await modal.screenshot({ path: join(artifacts, 'editor-mobile.png') });
await modal.locator('[data-action="cancel"]').first().click();
await page.setViewportSize({ width: 1280, height: 900 });
await card.locator('[data-action="edit"]').click();
await modal.screenshot({ path: join(artifacts, 'editor-desktop.png') });
console.log('PASS: mobile image/video selection, media bytes/order, published gallery image load and video playback, reload with published media, rich text, existing media removal, text-only save, desktop modal. Qortal bridge and QDN server are simulated.');
await browser.close();
