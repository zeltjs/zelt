import { NodeCliConfig } from '@zeltjs/adapter-node';
import { defineCommand } from 'citty';
import consola from 'consola';
import { match } from 'ts-pattern';

import { BuildError, runTsdownBuild } from '../builders/tsdown';
import { ConfigLoadError, loadZeltConfig } from '../config/loader';
import type { BuildConfig } from '../config/schema';

const cliConfig = new NodeCliConfig();

type BuildArgs = {
  readonly config?: string;
  readonly entry?: string;
  readonly outDir?: string;
};

class NoEntryError extends Error {
  readonly type = 'NO_ENTRY' as const;
}

type RunBuildError = ConfigLoadError | BuildError | NoEntryError;

const resolveBuildConfig = (args: BuildArgs, buildConfig: BuildConfig | undefined) => ({
  ...buildConfig,
  entry: args.entry ?? buildConfig?.entry,
  outDir: args.outDir ?? buildConfig?.outDir,
});

const runBuild = async (cwd: string, typedArgs: BuildArgs): Promise<void> => {
  const configFile = typedArgs.config;
  const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });
  const buildConfig = resolveBuildConfig(typedArgs, config.build);

  if (buildConfig.entry === undefined) {
    throw new NoEntryError();
  }

  consola.start('Building...');
  await runTsdownBuild({ cwd, config: buildConfig });
  consola.success('Build completed');
};

const handleError = (error: RunBuildError): void => {
  match(error)
    .with({ type: 'CONFIG_LOAD_FAILED' }, () => {
      consola.error('Failed to load config');
    })
    .with({ type: 'NO_ENTRY' }, () => {
      consola.error('No entry file specified. Use --entry or set build.entry in zelt.config.ts');
    })
    .with({ type: 'BUILD_FAILED' }, () => {
      consola.error('Build failed');
    })
    .exhaustive();
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
        error instanceof ConfigLoadError ||
        error instanceof BuildError ||
        error instanceof NoEntryError
      ) {
        handleError(error);
      } else {
        throw error;
      }
    }
  },
});
