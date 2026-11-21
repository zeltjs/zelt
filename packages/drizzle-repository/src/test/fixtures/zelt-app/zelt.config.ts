import { drizzleRepositoryPlugin } from '@zeltjs/drizzle-repository';

export default {
  app: () => ({}),
  plugins: [
    drizzleRepositoryPlugin({
      schema: './schema.ts',
      database: { from: './drizzle.service.ts', name: 'DrizzleService' },
      out: { model: './model', repository: './repository' },
    }),
  ],
  build: { command: 'tsdown --config tsdown.config.ts' },
};
