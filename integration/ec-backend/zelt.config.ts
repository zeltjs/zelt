import { defineConfig } from '@zeltjs/cli';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.createEcApp()),
});
