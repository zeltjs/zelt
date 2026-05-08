import { resolveMethodArgs } from '../internal/decorator-context';
import { appendPendingSkipMiddlewareMetadata } from '../internal/metadata';
import type { MiddlewareIdentifier } from '../middleware/types';

export const SkipMiddleware =
  (...middlewares: MiddlewareIdentifier[]) =>
  (...args: unknown[]): void => {
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new Error('zelt: @SkipMiddleware cannot be applied to static methods');
    }
    appendPendingSkipMiddlewareMetadata(pendingKey, methodName, middlewares);
  };
