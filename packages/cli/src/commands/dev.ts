import { defineCommand } from 'citty';
import consola from 'consola';
import { errAsync, ResultAsync } from 'neverthrow';
import { match } from 'ts-pattern';

import { type ConfigLoadError, loadZeltConfig } from '../config/loader';
import type { DevConfig } from '../config/schema';
import { startDevServer } from '../dev-server/server';

type DevArgs = {
  readonly config?: string;
  readonly entry?: string;
  readonly port?: string;
};

type DevError = ConfigLoadError | { type: 'NO_ENTRY' };

const resolveDevConfig = (args: DevArgs, devConfig: DevConfig | undefined) => {
  const entry = args.entry ?? devConfig?.entry;
  const port = args.port !== undefined ? Number.parseInt(args.port, 10) : devConfig?.port;

  return {
    ...devConfig,
    entry,
    port,
  };
};

const runDev = (cwd: string, typedArgs: DevArgs): ResultAsync<void, DevError> => {
  const configFile = typedArgs.config;

  return loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd }).andThen(
    (config) => {
      const devConfig = resolveDevConfig(typedArgs, config.dev);

      if (devConfig.entry === undefined) {
        return errAsync({ type: 'NO_ENTRY' as const });
      }

      return ResultAsync.fromSafePromise(
        startDevServer({ cwd, config: { ...devConfig, entry: devConfig.entry } }),
      );
    },
  );
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
    const cwd = globalThis.process.cwd();
    const typedArgs: DevArgs = args;

    const result = await runDev(cwd, typedArgs);

    result.match(
      () => {},
      (error) =>
        match(error)
          .with({ type: 'CONFIG_LOAD_FAILED' }, () => {
            consola.error('Failed to load config');
          })
          .with({ type: 'NO_ENTRY' }, () => {
            consola.error(
              'No entry file specified. Use --entry or set dev.entry in zelt.config.ts',
            );
          })
          .exhaustive(),
    );
  },
});
