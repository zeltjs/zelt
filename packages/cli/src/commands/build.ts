import { defineCommand } from 'citty';
import consola from 'consola';

import { runTsdownBuild } from '../builders/tsdown';
import { loadZeltConfig } from '../config/loader';
import type { BuildConfig } from '../config/schema';

type BuildArgs = {
  readonly config?: string;
  readonly entry?: string;
  readonly outDir?: string;
};

const resolveBuildConfig = (args: BuildArgs, buildConfig: BuildConfig | undefined) => ({
  ...buildConfig,
  entry: args.entry ?? buildConfig?.entry,
  outDir: args.outDir ?? buildConfig?.outDir,
});

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
    const cwd = process.cwd();
    const typedArgs: BuildArgs = args;

    const configFile = typedArgs.config;
    const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });

    const buildConfig = resolveBuildConfig(typedArgs, config.build);

    if (buildConfig.entry === undefined) {
      consola.error('No entry file specified. Use --entry or set build.entry in zelt.config.ts');
      process.exit(1);
    }

    consola.start('Building...');

    const result = await runTsdownBuild({
      cwd,
      config: buildConfig,
    });

    if (result.success) {
      consola.success('Build completed');
    } else {
      consola.error('Build failed');
      process.exit(result.exitCode);
    }
  },
});
