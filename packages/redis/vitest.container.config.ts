import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: '@zeltjs/redis:container',
      include: ['src/**/container/**/*.test.ts'],
      testTimeout: 60_000,
    },
  }),
);
