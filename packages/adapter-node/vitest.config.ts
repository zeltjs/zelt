import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@zeltjs/adapter-node',
    include: ['src/**/*.test.ts'],
  },
});
