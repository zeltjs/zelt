import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';
import { resolve } from 'node:path';

export default mergeConfig(
  sharedConfig,
  defineConfig({
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
  }),
);
