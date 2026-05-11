import {
  Container,
  type Container as ContainerType,
  inject,
  InjectionToken,
} from '@needle-di/core';

import type { ConfigClass } from './types';

type AnyConfigInstance = ConfigClass<object>;
type AnyConfigClass = new (...args: never[]) => unknown;

declare const rootConfigBrand: unique symbol;
type RootConfigClass = ConfigClass<object> & { [rootConfigBrand]: unknown };

type ConfigInjectionToken = InjectionToken<AnyConfigInstance>;

const registeredConfigs = new WeakSet<AnyConfigClass>();
const configClassMap = new WeakMap<RootConfigClass, ConfigInjectionToken>();
// needle-di Container lacks a has() API, so we track bound tokens ourselves
const boundTokens = new WeakMap<ContainerType, Set<ConfigInjectionToken>>();

export const registerConfigClass = (cls: AnyConfigClass): void => {
  registeredConfigs.add(cls);
};

const findRootConfigClass = (cls: AnyConfigClass): RootConfigClass => {
  let current: AnyConfigClass | null = cls;
  let root: AnyConfigClass | null = cls;

  while (current && current !== Function.prototype) {
    if (registeredConfigs.has(current)) {
      root = current;
    }
    current = Object.getPrototypeOf(current) as AnyConfigClass | null;
  }

  return root as RootConfigClass;
};

const getConfigToken = (rootConfig: RootConfigClass): ConfigInjectionToken => {
  const existing = configClassMap.get(rootConfig);
  if (existing) return existing;
  const token = new InjectionToken<AnyConfigInstance>(rootConfig.name);
  configClassMap.set(rootConfig, token);
  return token;
};

const isTokenBound = (container: ContainerType, token: ConfigInjectionToken): boolean =>
  boundTokens.get(container)?.has(token) ?? false;

const markTokenBound = (container: ContainerType, token: ConfigInjectionToken): void => {
  const existing = boundTokens.get(container);
  if (existing) {
    existing.add(token);
    return;
  }
  boundTokens.set(container, new Set([token]));
};

const bindConfig = (
  container: ContainerType,
  token: ConfigInjectionToken,
  cls: AnyConfigClass,
): void => {
  const singleToken = new InjectionToken<AnyConfigInstance>(`${cls.name}:single`);
  container.bind({
    provide: singleToken,
    useFactory: () => new (cls as new () => AnyConfigInstance)(),
  });
  container.bind({ provide: token, useExisting: singleToken });
  markTokenBound(container, token);
};

export const overrideConfig = (
  container: ContainerType,
  config: AnyConfigClass,
  options?: { readonly fallback?: boolean },
): void => {
  const rootClass = findRootConfigClass(config);
  const token = getConfigToken(rootClass);

  if (options?.fallback && isTokenBound(container, token)) return;

  if (!isTokenBound(container, token)) {
    bindConfig(container, token, rootClass as unknown as AnyConfigClass);
  }

  // child overrides root via later bind (last-wins semantics in needle-di)
  if ((config as unknown) !== (rootClass as unknown)) {
    bindConfig(container, token, config);
  }
};

export const resolveConfig = (container: ContainerType, config: AnyConfigClass): void => {
  const rootClass = findRootConfigClass(config);
  const token = getConfigToken(rootClass);
  container.get(token);
};

const ensureBound = (
  container: ContainerType,
  configClass: AnyConfigClass,
): ConfigInjectionToken => {
  const rootClass = findRootConfigClass(configClass);
  const token = getConfigToken(rootClass);
  if (!isTokenBound(container, token)) {
    bindConfig(container, token, rootClass as unknown as AnyConfigClass);
  }
  return token;
};

export const getConfig = <T extends object>(
  container: ContainerType,
  configClass: ConfigClass<T>,
): T => container.get(ensureBound(container, configClass as AnyConfigClass)) as T;

export const injectConfig = <T extends object>(configClass: ConfigClass<T>): T =>
  inject(ensureBound(inject(Container), configClass as AnyConfigClass)) as T;
