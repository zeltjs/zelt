import { AsyncLocalStorage } from 'node:async_hooks';

import { ZeltContextNotAvailableError } from '../errors';

export type ContextKey<T> = {
  readonly _symbol: symbol;
  readonly _brand: T;
};

const createKey = <T>(symbol: symbol): ContextKey<T> =>
  ({ _symbol: symbol, _brand: undefined }) as unknown as ContextKey<T>;

export const createContextKey = <T>(name: string): ContextKey<T> => createKey<T>(Symbol(name));

type ContextStore = Record<symbol, unknown>;

const storage = new AsyncLocalStorage<ContextStore>();

export const runInContext = <T>(fn: () => T): T => storage.run({}, fn);

const castValue = <T>(value: unknown): T | undefined => value as T | undefined;

/** @throws {ZeltContextNotAvailableError} */
export const getInternal = <T>(key: ContextKey<T>): T | undefined => {
  const store = storage.getStore();
  if (!store)
    throw new ZeltContextNotAvailableError({
      primitive: 'getInternal',
      requiredContext: 'entry',
    });
  return castValue<T>(store[key._symbol]);
};

/** @throws {ZeltContextNotAvailableError} */
export const setInternal = <T>(key: ContextKey<T>, value: T): void => {
  const store = storage.getStore();
  if (!store)
    throw new ZeltContextNotAvailableError({
      primitive: 'setInternal',
      requiredContext: 'entry',
    });
  store[key._symbol] = value;
};
