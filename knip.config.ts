import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignore: ['**/zelt.config.ts', 'packages/contract/src/test/**', '**/*.e2e-test.ts'],
  ignoreExportsUsedInFile: true,
  // GreetBody/GreetResponse: used via ts-morph AST resolution and AppType inference, invisible to static analysis
  // CreateUserBody/User: used by fixture file consumed via ts-morph at runtime, not traceable by static analysis
  ignoreMembers: ['GreetBody', 'GreetResponse', 'CreateUserBody', 'User'],
  workspaces: {
    'examples/hello': {
      entry: ['src/main.ts', 'src/entry/node.ts'],
      ignore: ['generated/**'],
      ignoreDependencies: ['@zeltjs/openapi', '@zeltjs/adapter-node', '@zeltjs/cli', 'tsdown'],
    },
    'examples/drizzle-todo': {
      entry: [
        'src/entry/node.ts',
        'src/app.ts',
        'src/controllers.ts',
        'src/todo/*.ts',
        'src/db/*.ts',
      ],
      ignoreDependencies: ['@zeltjs/adapter-node', '@zeltjs/core', 'valibot'],
    },
    'examples/workers-url-shortener': {
      entry: ['src/worker.ts', 'src/app.ts', 'src/controllers.ts', 'src/url/*.ts', 'src/env.ts'],
      ignoreDependencies: ['@zeltjs/core', 'valibot', 'wrangler'],
    },
    'packages/core': {
      // neverthrow は今後 Result wrapper に使う想定で keep。
      ignoreDependencies: ['neverthrow'],
    },
    'packages/adapter-node': {
      ignoreDependencies: ['@zeltjs/core'],
    },
    website: {
      // @docusaurus/plugin-content-docs types are re-exported by @docusaurus/preset-classic
      // prism-react-renderer is used internally by Docusaurus for code block syntax highlighting
      ignoreDependencies: ['@docusaurus/plugin-content-docs', 'prism-react-renderer'],
    },
  },
};

export default config;
