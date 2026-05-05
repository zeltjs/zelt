import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@zeltjs/core',
    include: ['src/**/*.test.ts'],
  },
});
