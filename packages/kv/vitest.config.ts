import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: '@zeltjs/kv',
      include: ['src/**/*.test.ts'],
      exclude: ['src/compliance.test.ts'],
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
