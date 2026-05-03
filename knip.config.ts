import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignore: ['**/koya.config.ts'],
  ignoreExportsUsedInFile: true,
  // GreetBody/GreetResponse: used via ts-morph AST resolution and AppType inference, invisible to static analysis
  // CreateUserBody/User: used by fixture file consumed via ts-morph at runtime, not traceable by static analysis
  ignoreMembers: ['GreetBody', 'GreetResponse', 'CreateUserBody', 'User'],
  workspaces: {
    'packages/core': {
      // neverthrow は今後 Result wrapper に使う想定で keep。
      ignoreDependencies: ['neverthrow'],
    },
    'packages/adapter-node': {
      ignoreDependencies: ['@hono/node-server', '@koya/core'],
    },
  },
};

export default config;
