import { injectable } from '@needle-di/core';

import { resolveClassArgs } from '../internal/decorator-context';

export const ErrorHandler = (...args: unknown[]): void => {
  const { injectableClass } = resolveClassArgs(args);
  injectable()(injectableClass);
};
