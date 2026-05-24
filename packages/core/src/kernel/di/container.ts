import { Container } from '@needle-di/core';
import type { ConfigClass } from '../../built-in-service/config';
import { getConfig, overrideConfig, resolveConfig } from '../../built-in-service/config';
import { ZeltLifecycleStateError } from '../errors';
import { LifecycleManager } from '../lifecycle';
import { resolve } from './resolve';

type Class<T> = new (...args: never[]) => T;

type CreateContainerOptions = {
  readonly defaults?: readonly Class<unknown>[];
  readonly configs?: readonly Class<unknown>[];
  readonly overrides?: readonly Class<unknown>[];
};

export type ResolverHandle = {
  readonly get: <T extends object>(cls: Class<T>) => T;
  readonly getConfig: <T extends object>(configClass: ConfigClass<T>) => T;
};

/** @throws {ZeltLifecycleStateError} */
const bindConfigs = (
  container: Container,
  configs: readonly Class<unknown>[],
  options?: { readonly fallback?: boolean },
): void => {
  for (const configClass of configs) {
    overrideConfig(container, configClass, options);
  }
};

/** @throws {ZeltLifecycleStateError} */
const resolveConfigs = (container: Container, configs: readonly Class<unknown>[]): void => {
  for (const configClass of configs) {
    resolveConfig(container, configClass);
  }
};

/** @throws {ZeltLifecycleStateError} */
export const createContainer = (options: CreateContainerOptions = {}): ResolverHandle => {
  const container = new Container();
  const configs = options.configs ?? [];
  const overrides = options.overrides ?? [];
  bindConfigs(container, configs);
  bindConfigs(container, options.defaults ?? [], { fallback: true });
  bindConfigs(container, overrides);
  resolveConfigs(container, configs);
  resolveConfigs(container, overrides);
  return {
    get: <T extends object>(cls: Class<T>): T => resolve(container, cls),
    getConfig: <T extends object>(configClass: ConfigClass<T>): T =>
      getConfig(container, configClass),
  };
};

type Override<T> = {
  readonly provide: Class<T>;
  readonly useValue: T;
};

export type CreateTestTargetOptions = {
  readonly configs?: readonly Class<unknown>[];
  readonly overrides?: readonly Override<unknown>[];
};

export type TestTargetResult<T> = {
  readonly target: T;
  readonly get: <U extends object>(cls: Class<U>) => U;
  readonly shutdown: () => Promise<void>;
};

const bindOverrides = (container: Container, overrides: readonly Override<unknown>[]): void => {
  for (const override of overrides) {
    container.bind({ provide: override.provide, useValue: override.useValue });
  }
};

/** @throws {ZeltLifecycleStateError} */
export const createTestTargetBase = async <T extends object>(
  targetClass: Class<T>,
  options: CreateTestTargetOptions = {},
): Promise<TestTargetResult<T>> => {
  const container = new Container();
  const configs = options.configs ?? [];

  bindConfigs(container, configs);
  bindOverrides(container, options.overrides ?? []);

  // Instantiate configs so they can register with LifecycleManager before startup
  for (const configClass of configs) {
    resolveConfig(container, configClass);
  }

  const lifecycle = container.get(LifecycleManager);
  try {
    await lifecycle.startup();
  } catch (error) {
    await lifecycle.shutdown();
    throw error;
  }

  const target = resolve(container, targetClass);

  let disposed = false;
  const shutdown = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    await lifecycle.shutdown();
  };

  /** @throws {ZeltLifecycleStateError} */
  const get = <U extends object>(cls: Class<U>): U => {
    if (disposed) {
      throw new ZeltLifecycleStateError({ operation: 'get', currentState: 'disposed' });
    }
    return resolve(container, cls);
  };

  return { target, get, shutdown };
};
