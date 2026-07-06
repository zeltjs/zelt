import { defineConfig } from '../../src/config/index';

export default defineConfig({
  app: () => import('no-such-module').then((m) => m.app),
});
