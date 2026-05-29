import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTwoslasher } from 'twoslash';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/twoslash -> website -> repo root
const rootDir = path.resolve(__dirname, '../../..');
const tsLibDirectory = path.resolve(rootDir, 'node_modules/typescript/lib');

/**
 * Shared Twoslash instance used both by the Docusaurus build (to render
 * type-checked code blocks) and by `scripts/typecheck-docs.ts` (to fail CI
 * when a doc snippet stops type-checking). Keeping a single instance prevents
 * the compilerOptions/paths from drifting between rendering and verification.
 */
export const twoslasher = createTwoslasher({
  vfsRoot: rootDir,
  tsLibDirectory,
  compilerOptions: {
    // module: ESNext + moduleResolution: Bundler — matches how the docs are
    // authored (bare specifiers, `paths` aliases, top-level await). The
    // previous ESNext + NodeNext pairing is rejected by tsc (TS5110), which
    // silently broke type-checking for every block.
    module: 99, // ESNext
    moduleResolution: 100, // Bundler
    target: 99, // ESNext
    lib: ['lib.esnext.full.d.ts'],
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    baseUrl: rootDir,
    // @zeltjs/* packages: resolved via explicit paths because pnpm's strict
    // node_modules structure doesn't work with Twoslash VFS.
    // Corresponding devDependencies in package.json ensure nx builds them first.
    paths: {
      '@zeltjs/validator-valibot': ['./packages/validator-valibot/dist/index.d.ts'],
      '@zeltjs/kv/adaptor-redis': ['./packages/kv/dist/adaptor-redis/index.d.ts'],
      '@zeltjs/redis/testing': ['./packages/redis/dist/testing/index.d.ts'],
      '@zeltjs/testing/vitest': ['./packages/testing/dist/adapters/vitest.d.ts'],
      '@zeltjs/testing/jest': ['./packages/testing/dist/adapters/jest.d.ts'],
      '@zeltjs/testing/bun': ['./packages/testing/dist/adapters/bun.d.ts'],
      '@zeltjs/testing/node': ['./packages/testing/dist/adapters/node.d.ts'],
      '@zeltjs/*': ['./packages/*/dist/index.d.ts'],
      valibot: [
        './node_modules/.pnpm/valibot@1.0.0_typescript@6.0.2/node_modules/valibot/dist/index.d.ts',
      ],
      hono: ['./node_modules/.pnpm/hono@4.12.16/node_modules/hono/dist/types/index.d.ts'],
      'hono/*': ['./node_modules/.pnpm/hono@4.12.16/node_modules/hono/dist/types/*.d.ts'],
      ioredis: ['./node_modules/.pnpm/ioredis@5.10.1/node_modules/ioredis/built/index.d.ts'],
      bullmq: ['./node_modules/.pnpm/bullmq@5.76.9/node_modules/bullmq/dist/esm/index.d.ts'],
    },
  },
});
