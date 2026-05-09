import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: '@zeltjs/openapi',
      include: ['src/**/*.test.ts'],
      passWithNoTests: true,
      // ts-morph project boot + emit pipelines are heavy; default 5s is tight under parallel load.
      testTimeout: 30_000,
    },
  }),
);
