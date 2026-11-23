import { defineConfig } from '@zeltjs/cli';
import { drizzleRepositoryPlugin } from '@zeltjs/drizzle-repository';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.app),
  plugins: [
    drizzleRepositoryPlugin({
      schema: './src/db/schema.ts',
      database: { from: './src/db/drizzle.service.ts', name: 'DrizzleService' },
      out: {
        model: './src/domain/generated',
        repository: './src/db/generated',
      },
    }),
  ],
});
