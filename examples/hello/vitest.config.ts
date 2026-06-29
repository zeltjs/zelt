import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: 'examples/hello',
      include: ['src/**/*.e2e.test.ts'],
    },
  }),
);
