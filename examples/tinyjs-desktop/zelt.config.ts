import { defineConfig } from '@zeltjs/cli';
import { honoClientPlugin } from '@zeltjs/hono-client';

export default defineConfig({
  app: () => import('./src/app').then(({ app }) => app),
  plugins: [
    honoClientPlugin({ outDir: './generated', portable: true, tsconfig: './tsconfig.json' }),
  ],
  build: { command: 'pnpm exec tsdown' },
});
