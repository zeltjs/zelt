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
import { nodeCliRuntime } from './cli-runtime.lib';
import type { BuildConfig } from './config/config.types';
import { loadZeltConfig } from './config/index';
import {
  generateHttpInvocationArtifacts,
  invalidateHttpInvocationArtifacts,
} from './http-invocation-artifacts.lib';
import { runBuildHook, runPostBuildHooks, runPreBuildHooks } from './plugin-runner.lib';
import { runTsdownBuild } from './tsdown.lib';

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

type BuildHookOptions = Parameters<typeof runPreBuildHooks>[0];

const resolveBuildConfig = (args: BuildArgs, buildConfig: BuildConfig | undefined) => ({
  ...buildConfig,
  entry: args.entry ?? buildConfig?.entry,
  outDir: args.outDir ?? buildConfig?.outDir,
});

const runPreBuildHooksWithArtifactInvalidation = async (
  cwd: string,
  hookOptions: BuildHookOptions,
): Promise<void> => {
  try {
    await runPreBuildHooks(hookOptions);
  } catch (error) {
    await invalidateHttpInvocationArtifacts({ cwd });
    throw error;
  }
};

const runBuildSteps = async (
  cwd: string,
  hookOptions: BuildHookOptions,
  buildConfig: BuildConfig & { readonly entry: string },
): Promise<void> => {
  await generateHttpInvocationArtifacts({
    ...hookOptions,
    runtime: {
      kind: 'node',
    },
  });

  const buildResult = await runBuildHook(hookOptions);

  if (!buildResult.handled) {
    consola.start('Building...');
    await runTsdownBuild({ cwd, config: buildConfig });
    consola.success('Build completed');
  }
};

const runPostBuildHooksWithArtifactInvalidation = async (
  cwd: string,
  hookOptions: BuildHookOptions,
  success: boolean,
): Promise<void> => {
  try {
    await runPostBuildHooks(hookOptions, { success });
  } catch (error) {
    await invalidateHttpInvocationArtifacts({ cwd });
    throw error;
  }
};

/** @throws {ZeltNoEntryError | ZeltBuildError | ZeltMultipleBuildHooksError | ZeltConfigLoadError | {} | null} */
const runBuild = async (cwd: string, typedArgs: BuildArgs): Promise<void> => {
  const configFile = typedArgs.config;
  const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });
  const buildConfig = resolveBuildConfig(typedArgs, config.build);

  if (buildConfig.entry === undefined) {
    throw new ZeltNoEntryError({});
  }

  const buildConfigWithEntry = { ...buildConfig, entry: buildConfig.entry };
  const hookOptions = { cwd, config, loadStaticApp: async () => config.app() };
  await runPreBuildHooksWithArtifactInvalidation(cwd, hookOptions);

  let success = true;
  let buildError: unknown;
  let postBuildError: unknown;

  try {
    await runBuildSteps(cwd, hookOptions, buildConfigWithEntry);
  } catch (error) {
    success = false;
    buildError = error;
    await invalidateHttpInvocationArtifacts({ cwd });
  } finally {
    try {
      await runPostBuildHooksWithArtifactInvalidation(cwd, hookOptions, success);
    } catch (error) {
      postBuildError = error;
    }
  }

  if (buildError !== undefined) {
    throw buildError;
  }
  if (postBuildError !== undefined) {
    throw postBuildError;
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
    const cwd = nodeCliRuntime.cwd();
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
