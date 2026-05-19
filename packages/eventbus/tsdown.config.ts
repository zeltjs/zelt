import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/adaptor-memory/index.ts', 'src/adaptor-redis/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: [
      '@zeltjs/core',
      /^@zeltjs\/core\//,
      '@zeltjs/redis',
      /^@zeltjs\/redis\//,
      'ioredis',
    ],
  },
});
