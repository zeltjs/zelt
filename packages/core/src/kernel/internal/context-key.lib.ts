import { AsyncLocalStorage } from 'node:async_hooks';
import type { DeferredValueHandle } from '@zeltjs/unsafe-type-lib';
import { DEFERRED_VALUE_TYPE, unsafeResolveDeferredValue } from '@zeltjs/unsafe-type-lib';

import { ZeltContextNotAvailableError } from '../errors';

export class ContextKey<T> implements DeferredValueHandle<T> {
  declare [DEFERRED_VALUE_TYPE]: T;

  constructor(readonly _symbol: symbol) {}
}

export const createContextKey = <T>(name: string): ContextKey<T> => new ContextKey<T>(Symbol(name));

type ContextStore = Record<symbol, unknown>;

const storage = new AsyncLocalStorage<ContextStore>();

export const runInContext = <T>(fn: () => T): T => storage.run({}, fn);

/** @throws {ZeltContextNotAvailableError} */
export const getInternal = <T>(key: ContextKey<T>): T | undefined => {
  const store = storage.getStore();
  if (!store)
    throw new ZeltContextNotAvailableError({
      primitive: 'getInternal',
      requiredContext: 'entry',
    });
  const value = store[key._symbol];
  return value === undefined ? undefined : unsafeResolveDeferredValue(key, value);
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
