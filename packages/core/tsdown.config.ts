import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/workers.ts',
    'src/lambda.ts',
    'src/modules/logger/index.ts',
    'src/modules/env/index.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: ['hono', /^hono\//, /^@hono\//, 'valibot'],
  },
});
