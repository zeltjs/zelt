import * as path from 'node:path';

import { defineConfig, mergeConfig } from 'vitest/config';

import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: '@zeltjs/cli',
      include: ['src/**/*.test.ts'],
    },
    resolve: {
      alias: {
        '@zeltjs/core/internal-bridge/testing': path.resolve(
          __dirname,
          '../core/src/internal-bridge/testing.ts',
        ),
        '@zeltjs/core/internal-bridge/errors': path.resolve(
          __dirname,
          '../core/src/internal-bridge/errors.ts',
        ),
        '@zeltjs/core': path.resolve(__dirname, '../core/src/index.ts'),
        '@zeltjs/adapter-node': path.resolve(__dirname, '../adapter-node/src/index.ts'),
        '@zeltjs/unsafe-type-lib': path.resolve(__dirname, '../unsafe-type-lib/src/index.ts'),
      },
    },
  }),
);
