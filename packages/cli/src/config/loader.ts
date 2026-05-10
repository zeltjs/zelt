import { loadConfig } from 'c12';

import type { ZeltConfig } from './schema';

export type LoadConfigOptions = {
  readonly cwd?: string;
  readonly configFile?: string;
};

export class ConfigLoadError extends Error {
  readonly type = 'CONFIG_LOAD_FAILED' as const;
  constructor(cause?: unknown) {
    super('Failed to load config');
    this.name = 'ConfigLoadError';
    this.cause = cause;
  }
}

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

export const loadZeltConfig = async (options: LoadConfigOptions = {}): Promise<ZeltConfig> => {
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

  try {
    const result = await loadConfig<ZeltConfig>(c12Options);
    return result.config;
  } catch (cause) {
    throw new ConfigLoadError(cause);
  }
};
