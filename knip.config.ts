import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignore: [
    '**/zelt.config.ts',
    '**/src/test/**',
    '**/src/test-helpers/**',
    'vitest.shared.ts',
    'scripts/**',
    'integration/**',
  ],
  ignoreDependencies: ['node-pty'],
  ignoreExportsUsedInFile: true,
  // GreetBody/GreetResponse: used via ts-morph AST resolution and AppType inference, invisible to static analysis
  // CreateUserBody/User: used by fixture file consumed via ts-morph at runtime, not traceable by static analysis
  ignoreMembers: ['GreetBody', 'GreetResponse', 'CreateUserBody', 'User'],
  workspaces: {
    'examples/hello': {
      entry: [
        'src/main.ts',
        'src/node.ts',
        'src/entry/*.ts',
        'src/app.ts',
        'src/controllers.ts',
        'src/middlewares/*.ts',
        'src/test/*.e2e.test.ts',
      ],
      ignore: ['generated/**'],
      ignoreDependencies: [
        '@zeltjs/openapi',
        '@zeltjs/hono-client',
        '@zeltjs/adapter-node',
        '@zeltjs/cli',
        '@zeltjs/core',
        '@zeltjs/validator-valibot',
        'tsdown',
        'valibot',
      ],
    },
    'examples/drizzle-todo': {
      entry: [
        'src/node.ts',
        'src/app.ts',
        'src/controllers.ts',
        'src/todo/*.ts',
        'src/db/*.ts',
        'src/test/*.e2e.test.ts',
      ],
      ignoreDependencies: [
        '@zeltjs/adapter-node',
        '@zeltjs/cli',
        '@zeltjs/core',
        '@zeltjs/validator-valibot',
        '@zeltjs/openapi',
        'valibot',
      ],
    },
    'examples/workers-url-shortener': {
      entry: ['src/worker.ts', 'src/app.ts', 'src/controllers.ts', 'src/url/*.ts', 'src/env.ts'],
      ignoreDependencies: ['@zeltjs/core', '@zeltjs/validator-valibot', 'valibot', 'wrangler'],
    },
    'packages/decorator-metadata': {
      // Test fixtures are imported dynamically in tests, not statically analyzable
      ignore: ['src/test/fixtures/**'],
    },
    'packages/core': {
      // neverthrow は今後 Result wrapper に使う想定で keep。
      ignoreDependencies: ['neverthrow'],
      // barrel files used by test files via '..' import path (required by no-cross-directory-lib-import rule)
      ignore: ['src/app/index.ts', 'src/features/scheduler/index.ts'],
    },
    'packages/graphql': {
      // gql-args-sample.lib.ts is a test fixture imported by generate-sdl.test.ts
      // for AST-based import resolution testing (must be a separate file)
      ignore: ['src/gql-args-sample.lib.ts'],
    },
    'packages/adapter-node': {
      ignoreDependencies: ['@zeltjs/core'],
    },
    'packages/adapter-cloudflare-workers': {
      ignoreDependencies: ['@zeltjs/core', 'cloudflare'],
    },
    'packages/cli': {
      // c12 is bundled into the CLI dist, but it imports jiti at runtime.
      // jiti must stay external because its package assets are not bundle-safe.
      ignoreDependencies: ['jiti'],
    },
    'packages/testing': {
      // node:test requires @types/node for types - referenced via optional peer dependency
      ignoreDependencies: ['@types/node'],
    },
    website: {
      // prism-theme-kanagawa.ts is imported by docusaurus.config.ts but knip --production misses it
      // scripts/*.ts are run via npm scripts (lint:slugs, test:docs)
      // remark/*.ts are remark plugins imported by docusaurus.config.ts
      entry: [
        'docusaurus.config.ts',
        'src/prism-theme-kanagawa.ts',
        'src/remark/*.ts',
        'src/twoslash/*.ts',
        'scripts/check-doc-slugs.ts',
        'scripts/extract-doc-tests.ts',
        'scripts/typecheck-docs.ts',
        'scripts/check-example-excerpts.ts',
      ],
      // prism-react-renderer is used internally by Docusaurus for code block syntax highlighting
      // wrangler is used by Cloudflare Workers build system for deployment
      // @docusaurus/theme-common is used by swizzled theme components
      // clsx is used by swizzled theme components
      // @easyops-cn/docusaurus-search-local is a Docusaurus theme loaded at runtime
      // @easyops-cn/docusaurus-theme-docusaurus-search-local is an internal dependency of docusaurus-search-local
      // docusaurus-markdown-source-plugin / docusaurus-plugin-llms are Docusaurus plugins loaded at runtime
      // docusaurus-plugin-docusaurus-markdown-source-plugin is internal Docusaurus plugin resolution
      // Twoslash VFS requires these packages for TypeScript path resolution in docs code blocks
      ignoreDependencies: [
        '@docusaurus/theme-common',
        '@easyops-cn/docusaurus-search-local',
        '@easyops-cn/docusaurus-theme-docusaurus-search-local',
        '@shikijs/rehype',
        '@shikijs/twoslash',
        '@zeltjs/adapter-cloudflare-workers',
        '@zeltjs/adapter-node',
        '@zeltjs/auth-jwt',
        '@zeltjs/auth-session',
        '@zeltjs/core',
        '@zeltjs/db',
        '@zeltjs/hono-client',
        '@zeltjs/kv',
        '@zeltjs/rate-limit',
        '@zeltjs/redis',
        '@zeltjs/testing',
        '@zeltjs/validator-valibot',
        '@floating-ui/react',
        'better-sqlite3',
        'bullmq',
        'clsx',
        'docusaurus-markdown-source-plugin',
        'docusaurus-plugin-docusaurus-markdown-source-plugin',
        'docusaurus-plugin-llms',
        'drizzle-orm',
        'prism-react-renderer',
        'shiki',
        'unist-util-visit',
        'valibot',
        'wrangler',
      ],
      // Swizzled Docusaurus theme components are loaded by Docusaurus at runtime
      ignore: ['src/theme/**'],
    },
  },
};

export default config;
