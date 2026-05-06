import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@zeltjs/command',
    include: ['src/**/*.test.ts'],
  },
});
