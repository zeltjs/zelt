import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignore: [
    '**/zelt.config.ts',
    'packages/contract/src/test/**',
    'packages/core/src/test-helpers/**',
    'vitest.shared.ts',
  ],
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
        '@zeltjs/adapter-node',
        '@zeltjs/core',
        '@zeltjs/cli',
        '@zeltjs/validate-valibot',
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
        '@zeltjs/validate-valibot',
        '@zeltjs/openapi',
        'valibot',
      ],
    },
    'examples/workers-url-shortener': {
      entry: ['src/worker.ts', 'src/app.ts', 'src/controllers.ts', 'src/url/*.ts', 'src/env.ts'],
      ignoreDependencies: ['@zeltjs/core', '@zeltjs/validate-valibot', 'valibot', 'wrangler'],
    },
    'packages/core': {
      // neverthrow は今後 Result wrapper に使う想定で keep。
      ignoreDependencies: ['neverthrow'],
      // app/index.ts is used by test files via '../app' import path
      ignore: ['src/app/index.ts'],
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
      // @docusaurus/plugin-content-docs types are re-exported by @docusaurus/preset-classic
      // prism-react-renderer is used internally by Docusaurus for code block syntax highlighting
      // wrangler is used by Cloudflare Workers build system for deployment
      ignoreDependencies: ['@docusaurus/plugin-content-docs', 'prism-react-renderer', 'wrangler'],
    },
  },
};

export default config;
