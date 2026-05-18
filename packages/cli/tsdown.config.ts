import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts', 'src/config/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    alwaysBundle: ['c12', 'citty', 'consola', 'ts-pattern'],
    neverBundle: [/^@zeltjs\//, 'tsdown', 'typescript', 'chokidar'],
  },
});
