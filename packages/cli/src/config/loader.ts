import { loadConfig } from 'c12';
import { ResultAsync } from 'neverthrow';

import type { ZeltConfig } from './schema';

export type LoadConfigOptions = {
  readonly cwd?: string;
  readonly configFile?: string;
};

export type ConfigLoadError = { type: 'CONFIG_LOAD_FAILED' };

const DEFAULT_BUILD_CONFIG = {
  outDir: './dist',
  platform: 'node',
  format: 'esm',
  external: true,
} as const;

const DEFAULT_DEV_CONFIG = {
  port: 3000,
  debounceMs: 300,
} as const;

export const loadZeltConfig = (
  options: LoadConfigOptions = {},
): ResultAsync<ZeltConfig, ConfigLoadError> => {
  const c12Options: Parameters<typeof loadConfig<ZeltConfig>>[0] = {
    name: 'zelt',
    defaults: {
      build: DEFAULT_BUILD_CONFIG,
      dev: DEFAULT_DEV_CONFIG,
    },
  };

  if (options.cwd !== undefined) {
    c12Options.cwd = options.cwd;
  }
  if (options.configFile !== undefined) {
    c12Options.configFile = options.configFile;
  }

  return ResultAsync.fromPromise(loadConfig<ZeltConfig>(c12Options), () => ({
    type: 'CONFIG_LOAD_FAILED' as const,
  })).map((result) => result.config);
};
