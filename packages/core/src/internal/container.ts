import { Container } from '@needle-di/core';

import { findConfigToken } from '../config';

type Class<T> = new (...args: never[]) => T;

type CreateContainerOptions = {
  readonly configs?: readonly Class<unknown>[] | undefined;
};

export type ResolverHandle = {
  readonly get: <T extends object>(cls: Class<T>) => T;
};

const bindConfigs = (container: Container, configs: readonly Class<unknown>[]): void => {
  for (const configClass of configs) {
    const token = findConfigToken(configClass);
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

type ResolveWithOptions = {
  readonly configs?: readonly Class<unknown>[];
  readonly overrides?: readonly Override<unknown>[];
};

type ResolveWithResult<T> = {
  readonly target: T;
  readonly resolver: ResolverHandle;
};

const bindOverrides = (container: Container, overrides: readonly Override<unknown>[]): void => {
  for (const override of overrides) {
    container.bind({ provide: override.provide, useValue: override.useValue });
  }
};

export const resolveWith = <T extends object>(
  targetClass: Class<T>,
  options: ResolveWithOptions = {},
): ResolveWithResult<T> => {
  const container = new Container();
  bindConfigs(container, options.configs ?? []);
  bindOverrides(container, options.overrides ?? []);

  const target = container.get<T>(targetClass);
  return {
    target,
    resolver: {
      get: <U extends object>(cls: Class<U>): U => container.get<U>(cls),
    },
  };
};
