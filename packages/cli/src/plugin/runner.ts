import consola from 'consola';

import type { ZeltConfig } from '../config/schema';

import type { BuildContext, ZeltPlugin } from './types';

export type RunPreBuildHooksOptions = {
  readonly cwd: string;
  readonly config: ZeltConfig;
};

export const runPreBuildHooks = async (options: RunPreBuildHooksOptions): Promise<void> => {
  const { cwd, config } = options;
  const plugins: readonly ZeltPlugin[] = config.plugins ?? [];

  for (const plugin of plugins) {
    if (plugin.preBuild !== undefined) {
      consola.info(`[${plugin.name}] Running preBuild hook...`);
      const context: BuildContext = { cwd, config };
      await plugin.preBuild(context);
      consola.success(`[${plugin.name}] preBuild completed`);
    }
  }
};
