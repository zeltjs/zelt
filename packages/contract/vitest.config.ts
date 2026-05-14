import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: '@zeltjs/openapi',
      include: ['src/**/*.test.ts'],
      passWithNoTests: true,
      testTimeout: 30_000,
    },
    resolve: {
      alias: {
        '@zeltjs/core/internal-bridge/errors': resolve(
          __dirname,
          '../core/src/internal-bridge/errors.ts',
        ),
        '@zeltjs/core': resolve(__dirname, '../core/src/index.ts'),
      },
    },
  }),
);
