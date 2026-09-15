import { defineConfig } from 'vitest/config';

// The published QWB app is served from a QDN resource path inside a Qortal host.
// All runtime asset references must therefore be relative (never root-absolute),
// so `base` stays the default relative form and the build emits no absolute URLs.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: false,
    // Content images are QDN-managed (not bundled); the structural/brand assets are
    // inlined only when small, so the app archive stays predictable.
    assetsInlineLimit: 4096,
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
});
