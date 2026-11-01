// Unit and integration tests. End-to-end and visual tests use Playwright (added in PR 2).
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^#core\/(.*)\.js$/,
        replacement: fileURLToPath(new URL('./src/core/$1', import.meta.url)),
      },
      {
        find: /^#server\/(.*)\.js$/,
        replacement: fileURLToPath(new URL('./src/server/$1', import.meta.url)),
      },
    ],
  },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
  },
});
