import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@zeltjs/kv-driver-redis',
    include: ['src/**/*.test.ts'],
  },
});
