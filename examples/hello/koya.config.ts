import { defineConfig } from '@koya/contract';

import { HelloController } from './src/entry/hello.controller';

export default defineConfig({
  controllers: [{ class: HelloController, source: './src/entry/hello.controller.ts' }],
  dist: './generated',
  tsconfig: './tsconfig.json',
});
