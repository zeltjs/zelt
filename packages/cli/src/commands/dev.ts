import { defineCommand } from 'citty';
import consola from 'consola';

import { loadZeltConfig } from '../config/loader';
import type { DevConfig } from '../config/schema';
import { startDevServer } from '../dev-server/server';

type DevArgs = {
  readonly config?: string;
  readonly entry?: string;
  readonly port?: string;
};

const resolveDevConfig = (args: DevArgs, devConfig: DevConfig | undefined) => {
  const entry = args.entry ?? devConfig?.entry;
  const port = args.port !== undefined ? Number.parseInt(args.port, 10) : devConfig?.port;

  return {
    ...devConfig,
    entry,
    port,
  };
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
    const cwd = process.cwd();
    const typedArgs: DevArgs = args;

    const configFile = typedArgs.config;
    const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });

    const devConfig = resolveDevConfig(typedArgs, config.dev);

    if (devConfig.entry === undefined) {
      consola.error('No entry file specified. Use --entry or set dev.entry in zelt.config.ts');
      process.exit(1);
    }

    await startDevServer({
      cwd,
      config: { ...devConfig, entry: devConfig.entry },
    });
  },
});
