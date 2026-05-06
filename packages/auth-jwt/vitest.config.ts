import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    name: '@zeltjs/auth-jwt',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Resolve @zeltjs/core from source to share the same @needle-di/core instance as direct imports.
      '@zeltjs/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
