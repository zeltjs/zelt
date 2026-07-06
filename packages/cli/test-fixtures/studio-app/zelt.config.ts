import { defineConfig } from '../../src/config/index';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.app),
});
