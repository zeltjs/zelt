import { cwd } from 'node:process';
import { honoClientPlugin } from '@zeltjs/hono-client';
import { app } from '../src/app';

const plugin = honoClientPlugin({
  outDir: './generated',
  portable: true,
  tsconfig: './tsconfig.json',
});
if (!plugin.preBuild) throw new Error('Hono client plugin must provide a preBuild hook');

await plugin.preBuild({
  cwd: cwd(),
  build: {},
  loadStaticApp: async () => app,
  registerGeneratedFile: () => {},
});
