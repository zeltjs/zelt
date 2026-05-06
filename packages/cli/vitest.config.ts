import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@zeltjs/cli',
    include: ['src/**/*.test.ts'],
  },
});
