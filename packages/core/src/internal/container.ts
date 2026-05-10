import { Container } from '@needle-di/core';

import { findRootConfigToken } from '../config';
import { LifecycleManager } from '../lifecycle';

type Class<T> = new (...args: never[]) => T;

type CreateContainerOptions = {
  readonly configs?: readonly Class<unknown>[] | undefined;
};

export type ResolverHandle = {
  readonly get: <T extends object>(cls: Class<T>) => T;
};

const bindConfigs = (container: Container, configs: readonly Class<unknown>[]): void => {
  for (const configClass of configs) {
    const token = findRootConfigToken(configClass);
    if (token && token !== configClass) {
      container.bind(configClass);
      container.bind({ provide: token, useExisting: configClass });
    }
  }
};

// Controllers / Service / Adapter は `@Controller` または `@injectable()` decorator により
// needle-di が `container.get(cls)` 時に auto-bind する。明示的な bind は持たない (spec §4.10)。
export const createContainer = (options: CreateContainerOptions = {}): ResolverHandle => {
  const container = new Container();
  bindConfigs(container, options.configs ?? []);
  return {
    get: <T extends object>(cls: Class<T>): T => container.get<T>(cls),
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

export const createTestTargetBase = async <T extends object>(
  targetClass: Class<T>,
  options: CreateTestTargetOptions = {},
): Promise<TestTargetResult<T>> => {
  const container = new Container();
  const configs = options.configs ?? [];

  bindConfigs(container, configs);
  bindOverrides(container, options.overrides ?? []);

  // Instantiate configs first so they can register with LifecycleManager
  for (const configClass of configs) {
    container.get(configClass);
  }

  const lifecycle = container.get(LifecycleManager);
  try {
    await lifecycle.startup();
  } catch (error) {
    await lifecycle.shutdown();
    throw error;
  }

  const target = container.get<T>(targetClass);

  let disposed = false;
  const shutdown = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    await lifecycle.shutdown();
  };

  const get = <U extends object>(cls: Class<U>): U => {
    if (disposed) {
      const name = cls.name || 'unknown';
      throw new Error(`Cannot resolve ${name}: TestTarget has been shut down`);
    }
    return container.get<U>(cls);
  };

  return { target, get, shutdown };
};
