import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

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
        '@zeltjs/core/internal-bridge/testing': resolve(
          __dirname,
          '../core/src/internal-bridge/testing.ts',
        ),
        '@zeltjs/core/internal-bridge/errors': resolve(
          __dirname,
          '../core/src/internal-bridge/errors.ts',
        ),
        '@zeltjs/core': resolve(__dirname, '../core/src/index.ts'),
      },
    },
  }),
);
