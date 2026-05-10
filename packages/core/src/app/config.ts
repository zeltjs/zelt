import type { ConfigClass } from '../config';
import { findRootConfigToken } from '../config/token';

import type { CreateAppOptions } from './types';

type AnyConfigClass = ConfigClass<object>;
type AnyConstructorClass = new (...args: never[]) => object;
type Resolver = { get: <T extends object>(cls: new (...args: never[]) => T) => T };

export type ConfigReadyOptions = {
  readonly configs: readonly AnyConstructorClass[] | undefined;
  readonly resolver: Resolver;
};

export const configReady = (options: ConfigReadyOptions): void => {
  const { configs, resolver } = options;
  for (const configClass of configs ?? []) {
    resolver.get(configClass);
  }
};

export const applyOverrides = (
  configs: readonly AnyConstructorClass[],
  overrides: ReadonlyMap<AnyConstructorClass, AnyConstructorClass>,
): readonly AnyConstructorClass[] => {
  if (overrides.size === 0) return configs;
  return configs.map((cfg) => overrides.get(cfg) ?? cfg);
};

const assertConfigToken = (
  tokenClass: AnyConfigClass,
  configs: readonly AnyConstructorClass[],
): void => {
  const targetRoot = findRootConfigToken(tokenClass);
  const hasToken = configs.some(
    (cfg) => cfg === tokenClass || findRootConfigToken(cfg) === targetRoot,
  );
  if (!hasToken) {
    throw new Error(`Cannot replaceConfig(): token ${tokenClass.name} is not in configs`);
  }
};

export const configHasToken = (
  configs: readonly AnyConstructorClass[],
  tokenClass: AnyConfigClass,
): boolean => {
  const targetRoot = findRootConfigToken(tokenClass);
  return configs.some((cfg) => cfg === tokenClass || findRootConfigToken(cfg) === targetRoot);
};

type ConfigState = {
  built: unknown;
  disposed: boolean;
  readonly configOverrides: Map<AnyConfigClass, AnyConfigClass>;
};

export const createReplaceConfig =
  (options: CreateAppOptions, state: ConfigState) =>
  (token: AnyConfigClass, replacement: AnyConfigClass): void => {
    if (state.disposed) throw new Error('Cannot replaceConfig() after shutdown()');
    if (state.built) throw new Error('Cannot replaceConfig() after ready()');
    assertConfigToken(token, options.configs ?? []);
    state.configOverrides.set(token, replacement);
  };

export type { AnyConfigClass, AnyConstructorClass, Resolver };
