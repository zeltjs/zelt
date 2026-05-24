import type { App, CreateAppOptions } from '@zeltjs/core';
import consola from 'consola';

import type { ZeltConfig } from '../config/schema';
import { ZeltMultipleBuildHooksError } from '../errors';

import type { BuildContext, BuildResult, ZeltPlugin } from './types';

export type RunPluginHooksOptions = {
  readonly cwd: string;
  readonly config: ZeltConfig;
  readonly app: App<CreateAppOptions>;
};

export const runPreBuildHooks = async (options: RunPluginHooksOptions): Promise<void> => {
  const { cwd, config, app } = options;
  const plugins: readonly ZeltPlugin[] = config.plugins ?? [];

  for (const plugin of plugins) {
    if (plugin.preBuild !== undefined) {
      consola.info(`[${plugin.name}] Running preBuild hook...`);
      const context: BuildContext = { cwd, config, app };
      await plugin.preBuild(context);
      consola.success(`[${plugin.name}] preBuild completed`);
    }
  }
};

export type RunBuildHookResult = {
  readonly handled: boolean;
};

export const runBuildHook = async (options: RunPluginHooksOptions): Promise<RunBuildHookResult> => {
  const { cwd, config, app } = options;
  const plugins: readonly ZeltPlugin[] = config.plugins ?? [];

  const pluginsWithBuild = plugins.filter((p) => p.build !== undefined);

  if (pluginsWithBuild.length > 1) {
    throw new ZeltMultipleBuildHooksError({
      pluginNames: pluginsWithBuild.map((p) => p.name),
    });
  }

  const plugin = pluginsWithBuild[0];
  if (plugin === undefined) {
    return { handled: false };
  }

  consola.info(`[${plugin.name}] Running build hook...`);
  const context: BuildContext = { cwd, config, app };
  await plugin.build?.(context);
  consola.success(`[${plugin.name}] build completed`);

  return { handled: true };
};

export const runPostBuildHooks = async (
  options: RunPluginHooksOptions,
  result: BuildResult,
): Promise<void> => {
  const { cwd, config, app } = options;
  const plugins: readonly ZeltPlugin[] = config.plugins ?? [];

  for (const plugin of plugins) {
    if (plugin.postBuild !== undefined) {
      consola.info(`[${plugin.name}] Running postBuild hook...`);
      const context: BuildContext = { cwd, config, app };
      await plugin.postBuild(context, result);
      consola.success(`[${plugin.name}] postBuild completed`);
    }
  }
};
