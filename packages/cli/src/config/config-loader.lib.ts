import { loadConfig } from 'c12';

import { ZeltConfigLoadError } from '../cli.errors';
import type { ZeltConfig } from './config.types';

export type LoadConfigOptions = {
  readonly cwd?: string;
  readonly configFile?: string;
};

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

type LoadedZeltConfig = Omit<ZeltConfig, 'app'> & {
  readonly app?: ZeltConfig['app'];
};

const hasAppLoader = (config: LoadedZeltConfig): config is ZeltConfig =>
  typeof config.app === 'function';

/** @throws {ZeltConfigLoadError} */
export const loadZeltConfig = async (options: LoadConfigOptions = {}): Promise<ZeltConfig> => {
  const c12Options: Parameters<typeof loadConfig<LoadedZeltConfig>>[0] = {
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
    const result = await loadConfig<LoadedZeltConfig>(c12Options);
    if (!hasAppLoader(result.config)) {
      throw new ZeltConfigLoadError({});
    }
    return result.config;
  } catch (cause) {
    if (cause instanceof ZeltConfigLoadError) {
      throw cause;
    }
    throw new ZeltConfigLoadError({}, cause);
  }
};
