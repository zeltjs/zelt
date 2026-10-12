import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./e2e/async-context.setup.ts'],
    include: ['e2e/**/*.spec.ts'],
  },
});
