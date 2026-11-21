import { defineConfig } from 'tsdown';
import swc from 'unplugin-swc';

// zelt uses TC39 decorators, which tsdown does not compile by itself.
export default defineConfig({
  entry: ['./main.ts'],
  outDir: './out',
  platform: 'node',
  format: 'esm',
  clean: true,
  deps: { neverBundle: [/^[^./]/] },
  plugins: [
    swc.rolldown({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorVersion: '2022-03' },
      },
    }),
  ],
});
