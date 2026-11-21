import { defineConfig } from '@zeltjs/cli';
import { drizzleRepositoryPlugin } from '@zeltjs/drizzle-repository';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.app),
  plugins: [
    drizzleRepositoryPlugin({
      schema: './src/schema.ts',
      database: { from: './src/drizzle.service.ts', name: 'DrizzleService' },
      out: { model: './src/generated/model', repository: './src/generated/repository' },
    }),
  ],
});
