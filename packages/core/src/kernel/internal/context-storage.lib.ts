import {
  createContextKey,
  getInternal,
  hasContext,
  runInContext,
  setInternal,
} from './context-key.lib';

export interface ContextStorage<T> {
  get(): T | undefined;
  run<R>(value: T, fn: () => R): R;
}

/** @throws {ZeltContextNotAvailableError} */
export const createContextStorage = <T>(name: string): ContextStorage<T> => {
  const key = createContextKey<T>(name);

  return {
    get: () => (hasContext() ? getInternal(key) : undefined),
    run: (value, fn) =>
      runInContext(() => {
        setInternal(key, value);
        return fn();
      }),
  };
};
