import { NodeCliConfig } from '@zeltjs/adapter-node';
import { createApp } from '@zeltjs/core';
import { defineCommand } from 'citty';
import consola from 'consola';
import { match } from 'ts-pattern';

import type {
  ZeltBuildError,
  ZeltConfigLoadError,
  ZeltMultipleBuildHooksError,
} from './cli.errors';
import {
  isZeltBuildError,
  isZeltConfigLoadError,
  isZeltMultipleBuildHooksError,
  isZeltNoEntryError,
  ZeltNoEntryError,
} from './cli.errors';
import { loadZeltConfig } from './config/index';
import type { BuildConfig } from './config/config.types';
import { runBuildHook, runPostBuildHooks, runPreBuildHooks } from './plugin-runner.lib';
import { runTsdownBuild } from './tsdown.lib';

const cliConfig = new NodeCliConfig();

type BuildArgs = {
  readonly config?: string;
  readonly entry?: string;
  readonly outDir?: string;
};

type RunBuildError =
  | InstanceType<typeof ZeltConfigLoadError>
  | InstanceType<typeof ZeltBuildError>
  | InstanceType<typeof ZeltNoEntryError>
  | InstanceType<typeof ZeltMultipleBuildHooksError>;

const resolveBuildConfig = (args: BuildArgs, buildConfig: BuildConfig | undefined) => ({
  ...buildConfig,
  entry: args.entry ?? buildConfig?.entry,
  outDir: args.outDir ?? buildConfig?.outDir,
});

/** @throws {ZeltNoEntryError | ZeltBuildError | ZeltMultipleBuildHooksError | ZeltConfigLoadError | {} | null} */
const runBuild = async (cwd: string, typedArgs: BuildArgs): Promise<void> => {
  const configFile = typedArgs.config;
  const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });
  const buildConfig = resolveBuildConfig(typedArgs, config.build);

  if (buildConfig.entry === undefined) {
    throw new ZeltNoEntryError({});
  }

  const app = createApp({ http: { controllers: [] } });
  const hookOptions = { cwd, config, app };

  await runPreBuildHooks(hookOptions);

  let success = true;
  let buildError: unknown;

  try {
    const buildResult = await runBuildHook(hookOptions);

    if (!buildResult.handled) {
      consola.start('Building...');
      await runTsdownBuild({ cwd, config: buildConfig });
      consola.success('Build completed');
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
      consola.error('No entry file specified. Use --entry or set build.entry in zelt.config.ts');
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
    description: 'Build the application using tsdown',
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
    const cwd = cliConfig.cwd();
    const typedArgs: BuildArgs = args;

    try {
      await runBuild(cwd, typedArgs);
    } catch (error) {
      if (
        isZeltConfigLoadError(error) ||
        isZeltBuildError(error) ||
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
