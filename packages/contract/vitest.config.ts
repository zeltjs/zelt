import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@zeltjs/openapi',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // ts-morph project boot + emit pipelines are heavy; default 5s is tight under parallel load.
    testTimeout: 30_000,
  },
});
