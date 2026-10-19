import { resolve } from 'node:path';
import { loadConfig } from 'c12';
import { createJiti } from 'jiti';

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

type ModuleLoader = (filePath: string) => Promise<unknown>;
const configModuleLoaders = new WeakMap<ZeltConfig, ModuleLoader>();
export const getConfigModuleLoader = (config: ZeltConfig): ModuleLoader | undefined =>
  configModuleLoaders.get(config);

const createConfigLoader = (options: LoadConfigOptions) =>
  createJiti(resolve(options.cwd ?? '.', options.configFile ?? 'zelt.config.ts'), {
    interopDefault: true,
  });

const inspectionLoader = (
  configFile: string | undefined,
  jiti: ReturnType<typeof createJiti>,
): ModuleLoader => {
  const owner = configFile === undefined ? undefined : jiti.cache[configFile];
  const importModule: unknown = owner && Reflect.get(owner.require, 'import');
  if (typeof importModule !== 'function') return (filePath) => jiti.import(filePath);
  return async (filePath) => {
    const namespace: unknown = await Reflect.apply(importModule, owner?.require, [filePath]);
    return namespace;
  };
};

const releaseConfigModules = (
  jiti: ReturnType<typeof createJiti>,
  existing: ReadonlySet<string>,
): void => {
  // Keep transformed modules in the configuration's own module scope, so a new
  // configuration load can observe source changes without sharing global cache.
  for (const file of Object.keys(jiti.cache)) {
    if (!existing.has(file)) delete jiti.cache[file];
  }
  jiti.options.moduleCache = false;
};

/** @throws {ZeltConfigLoadError} */
export const loadZeltConfig = async (options: LoadConfigOptions = {}): Promise<ZeltConfig> => {
  const jiti = createConfigLoader(options);
  const existingModules = new Set(Object.keys(jiti.cache));
  const c12Options: Parameters<typeof loadConfig<LoadedZeltConfig>>[0] = {
    name: 'zelt',
    jiti,
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
    configModuleLoaders.set(result.config, inspectionLoader(result.configFile, jiti));
    return result.config;
  } catch (cause) {
    if (cause instanceof ZeltConfigLoadError) {
      throw cause;
    }
    throw new ZeltConfigLoadError({}, cause);
  } finally {
    releaseConfigModules(jiti, existingModules);
  }
};
