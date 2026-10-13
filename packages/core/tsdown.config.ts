import swc from '@rollup/plugin-swc';
import { defineConfig } from 'tsdown';
import { pureClassDecorators } from '../../scripts/pure-class-decorators.mjs';

const swcDecoratorPlugin = swc({
  jsc: {
    parser: { syntax: 'typescript', decorators: true },
    transform: { decoratorVersion: '2022-03' },
  },
});

export default defineConfig({
  plugins: [swcDecoratorPlugin, pureClassDecorators()],
  entry: {
    index: 'src/index.ts',
    'async-context/index': 'src/async-context/index.ts',
    'internal-bridge/testing': 'src/internal-bridge/testing.ts',
    'internal-bridge/errors': 'src/internal-bridge/errors.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  outputOptions: {
    // Hono's route helpers and router must share their module instance and
    // private symbols; the CJS build must not dynamically load its ESM router.
    dynamicImportInCjs: false,
    // Keep the scheduler's library removable as a module; its internal assignments
    // otherwise survive in the shared DI/HTTP chunk even when Scheduler is unused.
    codeSplitting: {
      groups: [{ name: 'scheduler-runtime', test: /[/\\]node_modules[/\\]croner[/\\]/ }],
    },
  },
  clean: true,
  fixedExtension: false,
  deps: {
    alwaysBundle: ['croner', 'ts-pattern', '@zeltjs/unsafe-type-lib'],
    neverBundle: ['hono', /^hono\//, /^@hono\//, 'valibot'],
  },
});
