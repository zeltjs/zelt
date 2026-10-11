import { createContextKey, getStorageInternal, runInStorageContext } from './context-key.lib';

export interface ContextStorage<T> {
  get(): T | undefined;
  run<R>(value: T, fn: () => R): R;
}

export const createContextStorage = <T>(name: string): ContextStorage<T> => {
  const key = createContextKey<T>(name);

  return {
    get: () => getStorageInternal(key),
    run: (value, fn) => runInStorageContext(key, value, fn),
  };
};
