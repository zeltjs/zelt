import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      globals: true,
      include: ['src/**/*.{test,spec,e2e-spec}.?(c|m)[jt]s?(x)'],
    },
  }),
);
