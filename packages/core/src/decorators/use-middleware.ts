import { resolveMethodArgs, resolveClassArgs } from '../internal/decorator-context';
import {
  appendPendingMethodMiddlewareMetadata,
  setControllerMiddlewareMetadata,
} from '../internal/metadata';
import type { MiddlewareInput } from '../middleware/types';

export const UseMiddleware =
  (...middlewares: MiddlewareInput[]) =>
  (...args: unknown[]): unknown => {
    const [, second] = args;

    // Class decorator: second is undefined (legacy) or has kind:'class' (TC39)
    const isClassDecorator =
      second === undefined || (typeof second === 'object' && second !== null && 'kind' in second && (second as { kind: string }).kind === 'class');

    if (isClassDecorator) {
      const { cls } = resolveClassArgs(args);
      setControllerMiddlewareMetadata(cls, middlewares);
      return args[0];
    }

    // Method decorator
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new Error('zelt: @UseMiddleware cannot be applied to static methods');
    }
    appendPendingMethodMiddlewareMetadata(pendingKey, methodName, middlewares);
    return undefined;
  };
