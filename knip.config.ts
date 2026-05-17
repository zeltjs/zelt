import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignore: ['**/zelt.config.ts', '**/src/test/**', '**/src/test-helpers/**', 'vitest.shared.ts'],
  ignoreExportsUsedInFile: true,
  // GreetBody/GreetResponse: used via ts-morph AST resolution and AppType inference, invisible to static analysis
  // CreateUserBody/User: used by fixture file consumed via ts-morph at runtime, not traceable by static analysis
  ignoreMembers: ['GreetBody', 'GreetResponse', 'CreateUserBody', 'User'],
  workspaces: {
    'examples/hello': {
      entry: [
        'src/main.ts',
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
        '@zeltjs/core',
        '@zeltjs/cli',
        '@zeltjs/validator-valibot',
        'tsdown',
        'valibot',
      ],
    },
    'examples/drizzle-todo': {
      entry: [
        'src/entry/node.ts',
        'src/app.ts',
        'src/controllers.ts',
        'src/todo/*.ts',
        'src/db/*.ts',
        'src/test/*.e2e.test.ts',
      ],
      ignoreDependencies: [
        '@zeltjs/adapter-node',
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
      // app/index.ts is used by test files via '../app' import path
      // di/container.ts exports createContainer for test utilities only
      ignore: ['src/app/index.ts', 'src/di/container.ts'],
    },
    'packages/adapter-node': {
      ignoreDependencies: ['@zeltjs/core'],
    },
    'packages/adapter-cloudflare-workers': {
      ignoreDependencies: ['@zeltjs/core', 'cloudflare'],
    },
    'packages/testing': {
      // node:test requires @types/node for types - referenced via optional peer dependency
      ignoreDependencies: ['@types/node'],
    },
    website: {
      // prism-theme-kanagawa.ts is imported by docusaurus.config.ts but knip --production misses it
      entry: ['docusaurus.config.ts', 'src/prism-theme-kanagawa.ts'],
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
        'better-sqlite3',
        'bullmq',
        'clsx',
        'docusaurus-markdown-source-plugin',
        'docusaurus-plugin-docusaurus-markdown-source-plugin',
        'docusaurus-plugin-llms',
        'drizzle-orm',
        'prism-react-renderer',
        'valibot',
        'wrangler',
      ],
      // Swizzled Docusaurus theme components are loaded by Docusaurus at runtime
      ignore: ['src/theme/**'],
    },
  },
};

export default config;
