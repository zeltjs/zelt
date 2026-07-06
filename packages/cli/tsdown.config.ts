import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts', 'src/config/index.ts', 'src/studio/analyzer-entry.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    alwaysBundle: ['c12', 'citty', 'consola', 'ts-pattern'],
    neverBundle: [/^@zeltjs\//, 'tsdown', 'typescript', 'chokidar', 'jiti', 'tsx'],
  },
});
