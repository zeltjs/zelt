// packages/contract/src/load-config.ts
import { access } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { CliConfig } from '@zeltjs/core';

import type { ConfigError } from './errors';
import type { GenerateClientOptions } from './config/options';

const DEFAULT_CONFIG_NAMES = [
  'zelt.config.ts',
  'zelt.config.js',
  'zelt.config.mts',
  'zelt.config.mjs',
] as const;

const exists = async (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false,
  );

export const findConfigFile = async (cwd: string): Promise<string | undefined> => {
  for (const name of DEFAULT_CONFIG_NAMES) {
    const p = resolve(cwd, name);
    if (await exists(p)) return p;
  }
  return undefined;
};

function narrowConfig(value: unknown): GenerateClientOptions;
function narrowConfig(value: unknown): unknown {
  return value;
}

class InvalidConfigExportError extends Error {
  readonly type = 'INVALID_CONFIG_EXPORT' as const;
  readonly path: string;
  constructor(path: string) {
    super(`Invalid config export: ${path}`);
    this.name = 'InvalidConfigExportError';
    this.path = path;
  }
}

export const loadConfig = async (
  path: string,
  cliConfig: CliConfig,
): Promise<GenerateClientOptions> => {
  const abs = isAbsolute(path) ? path : resolve(cliConfig.cwd(), path);
  const url = pathToFileURL(abs).href;

  let mod: unknown;
  try {
    mod = await import(url);
  } catch {
    throw new InvalidConfigExportError(path);
  }

  if (typeof mod !== 'object' || mod === null) {
    throw new InvalidConfigExportError(path);
  }

  const namespace: Record<string, unknown> = { ...mod };
  const defaultKey = 'default';
  const cfg = namespace[defaultKey];
  if (cfg === undefined) {
    throw new InvalidConfigExportError(path);
  }

  return narrowConfig(cfg);
};

export const isLoadConfigError = (error: unknown): error is ConfigError =>
  error instanceof InvalidConfigExportError;
