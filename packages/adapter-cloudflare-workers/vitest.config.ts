import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@zeltjs/adapter-cloudflare-workers',
    alias: {
      'cloudflare:workers': new URL('./src/__mocks__/cloudflare-workers.ts', import.meta.url)
        .pathname,
    },
  },
});
