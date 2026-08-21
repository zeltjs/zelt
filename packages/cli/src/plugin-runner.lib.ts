import consola from 'consola';

import { ZeltMultipleBuildHooksError } from './cli.errors';
import type {
  BuildContext,
  BuildResult,
  PrebuiltContribution,
  ZeltConfig,
  ZeltPlugin,
} from './config/config.types';

export type RunPluginHooksOptions = {
  readonly cwd: string;
  readonly config: ZeltConfig;
  readonly loadStaticApp: () => Promise<object>;
  readonly registerGeneratedFile: (path: string) => void;
};

const createBuildContext = (options: RunPluginHooksOptions): BuildContext => ({
  cwd: options.cwd,
  build: options.config.build ?? {},
  loadStaticApp: options.loadStaticApp,
  registerGeneratedFile: options.registerGeneratedFile,
});

export const runPreBuildHooks = async (
  options: RunPluginHooksOptions,
): Promise<readonly PrebuiltContribution[]> => {
  const { config } = options;
  const plugins: readonly ZeltPlugin[] = config.plugins ?? [];

  const contributions: PrebuiltContribution[] = [];

  for (const plugin of plugins) {
    if (plugin.preBuild !== undefined) {
      consola.info(`[${plugin.name}] Running preBuild hook...`);
      const context = createBuildContext(options);
      const result = await plugin.preBuild(context);
      if (result !== undefined) {
        contributions.push(...result);
      }
      consola.success(`[${plugin.name}] preBuild completed`);
    }
  }

  return contributions;
};

export type RunBuildHookResult = {
  readonly handled: boolean;
};

/** @throws {ZeltMultipleBuildHooksError} */
export const runBuildHook = async (options: RunPluginHooksOptions): Promise<RunBuildHookResult> => {
  const { config } = options;
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
  const context = createBuildContext(options);
  await plugin.build?.(context);
  consola.success(`[${plugin.name}] build completed`);

  return { handled: true };
};

export const runPostBuildHooks = async (
  options: RunPluginHooksOptions,
  result: BuildResult,
): Promise<void> => {
  const { config } = options;
  const plugins: readonly ZeltPlugin[] = config.plugins ?? [];

  for (const plugin of plugins) {
    if (plugin.postBuild !== undefined) {
      consola.info(`[${plugin.name}] Running postBuild hook...`);
      const context = createBuildContext(options);
      await plugin.postBuild(context, result);
      consola.success(`[${plugin.name}] postBuild completed`);
    }
  }
};
