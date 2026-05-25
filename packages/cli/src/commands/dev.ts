// packages/cli/src/commands/dev.ts
import { NodeCliConfig } from '@zeltjs/adapter-node';
import { defineCommand } from 'citty';
import consola from 'consola';
import { match } from 'ts-pattern';

import { loadZeltConfig } from '../config/loader';
import type { DevConfig } from '../config/schema';
import { startDevServer } from '../dev-server/server';
import type { ZeltConfigLoadError } from '../errors';
import { isZeltConfigLoadError, isZeltNoEntryError, ZeltNoEntryError } from '../errors';

const cliConfig = new NodeCliConfig();

type DevArgs = {
  readonly config?: string;
  readonly entry?: string;
  readonly port?: string;
};

type DevError = InstanceType<typeof ZeltConfigLoadError> | InstanceType<typeof ZeltNoEntryError>;

const resolveDevConfig = (args: DevArgs, devConfig: DevConfig | undefined) => {
  const entry = args.entry ?? devConfig?.entry;
  const port = args.port !== undefined ? Number.parseInt(args.port, 10) : devConfig?.port;

  return {
    ...devConfig,
    entry,
    port,
  };
};

/** @throws {ZeltMultipleBuildHooksError | ZeltNoEntryError | ZeltConfigLoadError} */
const runDev = async (cwd: string, typedArgs: DevArgs): Promise<void> => {
  const configFile = typedArgs.config;
  const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });
  const devConfig = resolveDevConfig(typedArgs, config.dev);

  if (devConfig.entry === undefined) {
    throw new ZeltNoEntryError({});
  }

  await startDevServer({ cwd, config, devConfig: { ...devConfig, entry: devConfig.entry } });
};

const handleError = (error: DevError): void => {
  match(error)
    .when(isZeltConfigLoadError, () => {
      consola.error('Failed to load config');
    })
    .when(isZeltNoEntryError, () => {
      consola.error('No entry file specified. Use --entry or set dev.entry in zelt.config.ts');
    })
    .otherwise(() => {});
};

export const devCommand = defineCommand({
  meta: {
    name: 'dev',
    description: 'Start development server with file watching',
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
    port: {
      type: 'string',
      alias: 'p',
      description: 'Port to listen on (overrides config)',
    },
  },
  async run({ args }) {
    const cwd = cliConfig.cwd();
    const typedArgs: DevArgs = args;

    try {
      await runDev(cwd, typedArgs);
    } catch (error) {
      if (isZeltConfigLoadError(error) || isZeltNoEntryError(error)) {
        handleError(error);
      } else {
        throw error;
      }
    }
  },
});
