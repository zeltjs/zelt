import { defineCommand } from 'citty';
import consola from 'consola';
import { match } from 'ts-pattern';

import type { ZeltBuildError, ZeltConfigLoadError } from './cli.errors';
import {
  isZeltBuildCommandConflictError,
  isZeltBuildError,
  isZeltConfigLoadError,
  isZeltMultipleBuildHooksError,
  isZeltNoEntryError,
  ZeltBuildCommandConflictError,
  ZeltMultipleBuildHooksError,
  ZeltNoEntryError,
} from './cli.errors';
import { nodeCliRuntime } from './cli-runtime.lib';
import { runCommandBuild } from './command-build.lib';
import type { BuildConfig } from './config/config.types';
import { loadZeltConfig } from './config/index';
import { runBuildHook, runPostBuildHooks, runPreBuildHooks } from './plugin-runner.lib';
import { buildTsdownCommand } from './tsdown.lib';

type BuildArgs = {
  readonly config?: string;
  readonly entry?: string;
  readonly outDir?: string;
};

type RunBuildError =
  | InstanceType<typeof ZeltConfigLoadError>
  | InstanceType<typeof ZeltBuildCommandConflictError>
  | InstanceType<typeof ZeltBuildError>
  | InstanceType<typeof ZeltNoEntryError>
  | InstanceType<typeof ZeltMultipleBuildHooksError>;

const resolveBuildConfig = (args: BuildArgs, buildConfig: BuildConfig | undefined) => ({
  ...buildConfig,
  entry: args.entry ?? buildConfig?.entry,
  outDir: args.outDir ?? buildConfig?.outDir,
});

const getBuildHookPluginNames = (
  plugins: readonly { readonly name: string; readonly build?: unknown }[] = [],
) => plugins.filter((plugin) => plugin.build !== undefined).map((plugin) => plugin.name);

/** @throws {ZeltMultipleBuildHooksError | ZeltBuildCommandConflictError | ZeltNoEntryError} */
const assertBuildImplementation = (
  buildConfig: BuildConfig,
  buildHookPluginNames: readonly string[],
): void => {
  if (buildHookPluginNames.length > 1) {
    throw new ZeltMultipleBuildHooksError({ pluginNames: buildHookPluginNames });
  }

  if (buildHookPluginNames[0] !== undefined && buildConfig.command !== undefined) {
    throw new ZeltBuildCommandConflictError({ pluginName: buildHookPluginNames[0] });
  }

  if (
    buildHookPluginNames.length === 0 &&
    buildConfig.command === undefined &&
    buildConfig.entry === undefined
  ) {
    throw new ZeltNoEntryError({});
  }
};

/** @throws {ZeltBuildError} */
const runDefaultBuild = async (
  cwd: string,
  buildConfig: BuildConfig,
  env: NodeJS.ProcessEnv,
): Promise<void> => {
  consola.start('Building...');
  const command = buildConfig.command ?? buildTsdownCommand(buildConfig);
  await runCommandBuild({ cwd, command, env });
  consola.success('Build completed');
};

/** @throws {ZeltNoEntryError | ZeltBuildCommandConflictError | ZeltBuildError | ZeltMultipleBuildHooksError | ZeltConfigLoadError | {} | null} */
export const runBuild = async (cwd: string, typedArgs: BuildArgs): Promise<void> => {
  const configFile = typedArgs.config;
  const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });
  const buildConfig = resolveBuildConfig(typedArgs, config.build);
  const buildHookPluginNames = getBuildHookPluginNames(config.plugins);

  assertBuildImplementation(buildConfig, buildHookPluginNames);

  const hookOptions = { cwd, config, loadStaticApp: async () => config.app() };

  await runPreBuildHooks(hookOptions);

  let success = true;
  let buildError: unknown;

  try {
    const buildResult = await runBuildHook(hookOptions);

    if (!buildResult.handled) {
      await runDefaultBuild(cwd, buildConfig, nodeCliRuntime.env());
    }
  } catch (error) {
    success = false;
    buildError = error;
  } finally {
    await runPostBuildHooks(hookOptions, { success });
  }

  if (buildError !== undefined) {
    throw buildError;
  }
};

const handleError = (error: RunBuildError): void => {
  match(error)
    .when(isZeltConfigLoadError, () => {
      consola.error('Failed to load config');
    })
    .when(isZeltNoEntryError, () => {
      consola.error(
        'No entry file specified. Use --entry, set build.entry, or set build.command in zelt.config.ts',
      );
    })
    .when(isZeltBuildCommandConflictError, (e) => {
      consola.error(e.message);
    })
    .when(isZeltBuildError, () => {
      consola.error('Build failed');
    })
    .when(isZeltMultipleBuildHooksError, (e) => {
      consola.error(e.message);
    })
    .otherwise(() => {});
};

export const buildCommand = defineCommand({
  meta: {
    name: 'build',
    description: 'Build the application',
  },
  args: {
    config: {
      type: 'string',
      alias: 'c',
      description: 'Path to zelt.config.ts',
    },
    entry: {
      type: 'string',
      alias: 'e',
      description: 'Entry file (overrides config)',
    },
    outDir: {
      type: 'string',
      alias: 'o',
      description: 'Output directory (overrides config)',
    },
  },
  async run({ args }) {
    const cwd = nodeCliRuntime.cwd();
    const typedArgs: BuildArgs = args;

    try {
      await runBuild(cwd, typedArgs);
    } catch (error) {
      if (
        isZeltConfigLoadError(error) ||
        isZeltBuildError(error) ||
        isZeltBuildCommandConflictError(error) ||
        isZeltNoEntryError(error) ||
        isZeltMultipleBuildHooksError(error)
      ) {
        handleError(error);
      } else {
        throw error;
      }
    }
  },
});
