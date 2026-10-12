import { createContextStorage } from '../../kernel';

import type { LogContext } from './logger.types';

const storage = /* @__PURE__ */ createContextStorage<LogContext>('zelt:log');

export const getLogContext = (): LogContext => {
  return storage.get() ?? {};
};

export const withLogContext = <T>(ctx: LogContext, fn: () => T): T => {
  const current = getLogContext();
  const merged = { ...current, ...ctx };
  return storage.run(merged, fn);
};
