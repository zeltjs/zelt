import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CreateTwoslashOptions,
  ExtraFiles,
  TwoslashExecuteOptions,
  TwoslashInstance,
} from 'twoslash';
import { createTwoslasher } from 'twoslash';
import type { TwoslashBlock } from './code-blocks.lib';
import { graphqlDrizzleSetup } from './graphql-drizzle-setup.lib';
import { createTwoslashDiskOptions } from './twoslash-disk.lib';

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
 * Shared Twoslash options used both by the Docusaurus build (to render
 * type-checked code blocks) and by `scripts/typecheck-docs.ts` (to fail CI
 * when a doc snippet stops type-checking). Keeping a single definition prevents
 * the compilerOptions/paths from drifting between rendering and verification.
 */
const twoslashOptions = {
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
    types: ['node'],
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    baseUrl: rootDir,
    // @zeltjs/* packages: resolved via explicit paths because pnpm's strict
    // node_modules structure doesn't work with Twoslash VFS.
    // Corresponding devDependencies in package.json ensure nx builds them first.
    paths: {
      '@zeltjs/core/async-context': ['./packages/core/dist/async-context/index.d.ts'],
      '@zeltjs/adapter-tinyjs/renderer': ['./packages/adapter-tinyjs/dist/renderer/index.d.ts'],
      '@zeltjs/adapter-electron': ['./packages/adapter-electron/dist/main/index.d.ts'],
      '@zeltjs/adapter-electron/preload': ['./packages/adapter-electron/dist/preload/index.d.ts'],
      '@zeltjs/adapter-electron/renderer': ['./packages/adapter-electron/dist/renderer/index.d.ts'],
      '@zeltjs/validator-valibot': ['./packages/validator-valibot/dist/index.d.ts'],
      '@zeltjs/validator-valibot/openapi': ['./packages/validator-valibot/dist/openapi/index.d.ts'],
      '@zeltjs/graphql-drizzle/codegen': ['./packages/graphql-drizzle/dist/codegen.d.ts'],
      '@zeltjs/graphql-drizzle/metadata': ['./packages/graphql-drizzle/dist/metadata.d.ts'],
      '@zeltjs/graphql/codegen': ['./packages/graphql/dist/codegen.d.ts'],
      '@zeltjs/kv/adaptor-redis': ['./packages/kv/dist/adaptor-redis/index.d.ts'],
      '@zeltjs/eventbus/adaptor-memory': ['./packages/eventbus/dist/adaptor-memory/index.d.ts'],
      '@zeltjs/eventbus/adaptor-redis': ['./packages/eventbus/dist/adaptor-redis/index.d.ts'],
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
      'drizzle-orm': pnpmTypes('drizzle-orm@', 'drizzle-orm/index.d.ts'),
      // drizzle-metadata/register augments modules such as 'drizzle-orm/table', which are files.
      'drizzle-orm/*': [
        ...pnpmTypes('drizzle-orm@', 'drizzle-orm/*/index.d.ts'),
        ...pnpmTypes('drizzle-orm@', 'drizzle-orm/*.d.ts'),
      ],
      'drizzle-metadata': pnpmTypes('drizzle-metadata@', 'drizzle-metadata/dist/index.d.ts'),
      'drizzle-metadata/register': pnpmTypes(
        'drizzle-metadata@',
        'drizzle-metadata/dist/register.d.ts',
      ),
      postgres: pnpmTypes('postgres@', 'postgres/types/index.d.ts'),
    },
  },
} satisfies CreateTwoslashOptions;

const databaseService = path.join(__dirname, 'fixtures/graphql-drizzle/drizzle.service.ts');

// Blocks of a guide share files built from that same page, so each language checks its own code.
const sharedFiles = (code: string, page: readonly TwoslashBlock[]): ExtraFiles =>
  code.includes('// @filename: graphql-drizzle/')
    ? graphqlDrizzleSetup(page, readFileSync(databaseService, 'utf8'))
    : {};

/**
 * Twoslash 0.3.9 keeps one virtual file system per instance, even with `cache: false`, and
 * leaves a snippet's files in it when the snippet fails. Each snippet therefore gets its own
 * instance, so no snippet can see another's files and the result does not depend on order.
 */
export const createTwoslasherForPage = () => {
  const optionsForSnippet = {
    ...twoslashOptions,
    ...createTwoslashDiskOptions(),
    cache: false,
  } as const;
  return (page: readonly TwoslashBlock[]): TwoslashInstance =>
    Object.assign(
      (code: string, lang?: string, options?: TwoslashExecuteOptions) =>
        createTwoslasher(optionsForSnippet)(code, lang, {
          ...options,
          extraFiles: { ...sharedFiles(code, page), ...options?.extraFiles },
        }),
      { getCacheMap: () => undefined },
    );
};
