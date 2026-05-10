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
        '@zeltjs/core': path.resolve(__dirname, '../core/src/index.ts'),
      },
    },
  }),
);
