import { Container } from '@needle-di/core';

import { overrideConfig, resolveConfig } from '../built-in-service/config';
import { resolve } from '../kernel/di/resolve';
import { ZeltLifecycleStateError } from '../kernel/errors';
import { LifecycleManager } from '../kernel/lifecycle';

type Class<T> = new (...args: never[]) => T;

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

const bindConfigs = (
  container: Container,
  configs: readonly Class<unknown>[],
  options?: { readonly fallback?: boolean },
): void => {
  for (const configClass of configs) {
    overrideConfig(container, configClass, options);
  }
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

  for (const configClass of configs) {
    resolveConfig(container, configClass);
  }

  const lifecycle = container.get(LifecycleManager);
  let target: T;
  try {
    await lifecycle.startup();
    target = resolve(container, targetClass);
  } catch (error) {
    await lifecycle.shutdown().catch(() => {});
    throw error;
  }

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
