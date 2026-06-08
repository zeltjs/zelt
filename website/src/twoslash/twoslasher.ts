import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTwoslasher } from 'twoslash';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/twoslash -> website -> repo root
const rootDir = path.resolve(__dirname, '../../..');
const tsLibDirectory = path.resolve(rootDir, 'node_modules/typescript/lib');

// Resolve a third-party package's types through pnpm's content-addressed store
// by prefix instead of hard-coding the (peer-hashed) version directory. The
// hard-coded path drifts on every dependency bump and only happens to resolve
// in a non-clean node_modules, which silently breaks type-checking on a fresh
// install (CI, new worktree).
const pnpmModulesDir = path.join(rootDir, 'node_modules/.pnpm');
const pnpmEntries = existsSync(pnpmModulesDir) ? readdirSync(pnpmModulesDir) : [];
const pnpmTypes = (prefix: string, subpath: string): string[] => {
  const match = pnpmEntries
    .filter((dir) => dir.startsWith(prefix))
    .sort()
    .pop();
  return match ? [`./node_modules/.pnpm/${match}/node_modules/${subpath}`] : [];
};

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
      '@zeltjs/adapter-electron': ['./packages/adapter-electron/dist/main/index.d.ts'],
      '@zeltjs/validator-valibot': ['./packages/validator-valibot/dist/index.d.ts'],
      '@zeltjs/kv/adaptor-redis': ['./packages/kv/dist/adaptor-redis/index.d.ts'],
      '@zeltjs/redis/testing': ['./packages/redis/dist/testing/index.d.ts'],
      '@zeltjs/testing/vitest': ['./packages/testing/dist/adapters/vitest.d.ts'],
      '@zeltjs/testing/jest': ['./packages/testing/dist/adapters/jest.d.ts'],
      '@zeltjs/testing/bun': ['./packages/testing/dist/adapters/bun.d.ts'],
      '@zeltjs/testing/node': ['./packages/testing/dist/adapters/node.d.ts'],
      '@zeltjs/*': ['./packages/*/dist/index.d.ts'],
      valibot: pnpmTypes('valibot@', 'valibot/dist/index.d.mts'),
      hono: pnpmTypes('hono@', 'hono/dist/types/index.d.ts'),
      'hono/*': pnpmTypes('hono@', 'hono/dist/types/*.d.ts'),
      ioredis: pnpmTypes('ioredis@', 'ioredis/built/index.d.ts'),
      bullmq: pnpmTypes('bullmq@', 'bullmq/dist/esm/index.d.ts'),
    },
  },
});
