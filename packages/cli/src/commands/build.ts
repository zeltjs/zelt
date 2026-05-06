import { defineCommand } from 'citty';
import consola from 'consola';
import { errAsync, type ResultAsync } from 'neverthrow';
import { match } from 'ts-pattern';

import { type BuildError, runTsdownBuild } from '../builders/tsdown';
import { type ConfigLoadError, loadZeltConfig } from '../config/loader';
import type { BuildConfig } from '../config/schema';

type BuildArgs = {
  readonly config?: string;
  readonly entry?: string;
  readonly outDir?: string;
};

type RunBuildError = ConfigLoadError | BuildError | { type: 'NO_ENTRY' };

const resolveBuildConfig = (args: BuildArgs, buildConfig: BuildConfig | undefined) => ({
  ...buildConfig,
  entry: args.entry ?? buildConfig?.entry,
  outDir: args.outDir ?? buildConfig?.outDir,
});

const runBuild = (cwd: string, typedArgs: BuildArgs): ResultAsync<void, RunBuildError> => {
  const configFile = typedArgs.config;

  return loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd }).andThen(
    (config) => {
      const buildConfig = resolveBuildConfig(typedArgs, config.build);

      if (buildConfig.entry === undefined) {
        return errAsync({ type: 'NO_ENTRY' as const });
      }

      consola.start('Building...');

      return runTsdownBuild({ cwd, config: buildConfig }).map(() => {
        consola.success('Build completed');
        return undefined;
      });
    },
  );
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
    const cwd = globalThis.process.cwd();
    const typedArgs: BuildArgs = args;

    const result = await runBuild(cwd, typedArgs);

    result.match(
      () => {},
      (error) =>
        match(error)
          .with({ type: 'CONFIG_LOAD_FAILED' }, () => {
            consola.error('Failed to load config');
          })
          .with({ type: 'NO_ENTRY' }, () => {
            consola.error(
              'No entry file specified. Use --entry or set build.entry in zelt.config.ts',
            );
          })
          .with({ type: 'BUILD_FAILED' }, () => {
            consola.error('Build failed');
          })
          .exhaustive(),
    );
  },
});
