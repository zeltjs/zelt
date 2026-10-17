import { defineConfig } from 'vitest/config';

import { sharedConfig } from '../../vitest.shared';

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    name: '@zeltjs/adapter-cloudflare-workers',
    include: ['src/**/*.test.ts'],
    alias: {
      'cloudflare:workers': new URL('./src/__mocks__/cloudflare-workers.lib.ts', import.meta.url)
        .pathname,
    },
  },
});
