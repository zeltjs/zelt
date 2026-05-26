import { AsyncLocalStorage } from 'node:async_hooks';

import type { LogContext } from './logger.types';

const storage = new AsyncLocalStorage<LogContext>();

export const getLogContext = (): LogContext => {
  return storage.getStore() ?? {};
};

export const withLogContext = <T>(ctx: LogContext, fn: () => T): T => {
  const current = getLogContext();
  const merged = { ...current, ...ctx };
  return storage.run(merged, fn);
};
