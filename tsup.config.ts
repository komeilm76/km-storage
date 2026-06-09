import { defineConfig } from 'tsup';

// km-storage uses browser APIs (localStorage, sessionStorage, window).
// All three entries use platform:'browser' so tsup tree-shakes Node built-ins
// and produces bundles safe for browser consumption.

export default defineConfig([
  // ── 1. ESM (.mjs) ─────────────────────────────────────────────────────────
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outExtension() {
      return { js: '.mjs' };
    },
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'build/esm',
    target: 'esnext',
    platform: 'neutral',
    minify: true,
  },

  // ── 2. CommonJS (.cjs) ────────────────────────────────────────────────────
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    outExtension() {
      return { js: '.cjs' };
    },
    dts: true,
    sourcemap: true,
    clean: false,
    outDir: 'build/cjs',
    target: 'es2019',
    platform: 'neutral',
    minify: true,
  },

  // ── 3. Universal JS (.js) ─────────────────────────────────────────────────
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outExtension() {
      return { js: '.js' };
    },
    dts: true,
    sourcemap: true,
    clean: false,
    outDir: 'build/js',
    target: 'es2020',
    platform: 'neutral',
    minify: true,
  },
]);
