import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxDev: false,
    jsxImportSource: '@opentui/solid',
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
