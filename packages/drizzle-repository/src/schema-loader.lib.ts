import { resolve } from 'node:path';

import { createJiti } from 'jiti';

import type { ModuleLoader } from './generate.lib';

// Without a fresh module cache, a long-running process (zelt dev) would keep generating from the first schema it read.
export const freshModuleLoader = (cwd: string): ModuleLoader => {
  const jiti = createJiti(resolve(cwd, 'package.json'), { moduleCache: false });
  return async (path) => jiti.import(path);
};
