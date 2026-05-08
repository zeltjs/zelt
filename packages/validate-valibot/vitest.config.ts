import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@zeltjs/validate-valibot',
    include: ['src/**/*.test.ts'],
  },
});
