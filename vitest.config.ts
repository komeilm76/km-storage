import { defineConfig } from 'vitest/config';

// km-storage uses browser APIs (localStorage, sessionStorage, window.addEventListener).
// 'jsdom' simulates these APIs in Node so tests can run without a real browser.

export default defineConfig({
  test: {
    environment: 'jsdom',

    include: ['tests/**/*.test.ts'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
  },
});
