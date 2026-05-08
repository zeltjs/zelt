import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // TODO: remove rate-limit exclusion after it adapts to new KV API
    projects: ['packages/*', '!packages/rate-limit', 'examples/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
