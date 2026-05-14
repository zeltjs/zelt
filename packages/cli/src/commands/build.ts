import { NodeCliConfig } from '@zeltjs/adapter-node';
import { defineCommand } from 'citty';
import consola from 'consola';
import { match } from 'ts-pattern';

import { runTsdownBuild } from '../builders/tsdown';
import { loadZeltConfig } from '../config/loader';
import type { BuildConfig } from '../config/schema';
import type { ZeltBuildError, ZeltConfigLoadError } from '../errors';
import {
  isZeltBuildError,
  isZeltConfigLoadError,
  isZeltNoEntryError,
  ZeltNoEntryError,
} from '../errors';

const cliConfig = new NodeCliConfig();

type BuildArgs = {
  readonly config?: string;
  readonly entry?: string;
  readonly outDir?: string;
};

type RunBuildError =
  | InstanceType<typeof ZeltConfigLoadError>
  | InstanceType<typeof ZeltBuildError>
  | InstanceType<typeof ZeltNoEntryError>;

const resolveBuildConfig = (args: BuildArgs, buildConfig: BuildConfig | undefined) => ({
  ...buildConfig,
  entry: args.entry ?? buildConfig?.entry,
  outDir: args.outDir ?? buildConfig?.outDir,
});

/** @throws {ZeltConfigLoadError | ZeltBuildError | ZeltNoEntryError | InvalidConfigExportError} */
const runBuild = async (cwd: string, typedArgs: BuildArgs): Promise<void> => {
  const configFile = typedArgs.config;
  const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });
  const buildConfig = resolveBuildConfig(typedArgs, config.build);

  if (buildConfig.entry === undefined) {
    throw new ZeltNoEntryError({});
  }

  consola.start('Building...');
  await runTsdownBuild({ cwd, config: buildConfig });
  consola.success('Build completed');
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
      if (isZeltConfigLoadError(error) || isZeltBuildError(error) || isZeltNoEntryError(error)) {
        handleError(error);
      } else {
        throw error;
      }
    }
  },
});
