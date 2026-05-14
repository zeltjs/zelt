import { match, P } from 'ts-pattern';

import { ZeltDecoratorUsageError } from '../../errors';
import { resolveClassArgs, resolveMethodArgs } from '../../internal/decorator-context';
import {
  appendPendingMethodMiddlewareMetadata,
  setControllerMiddlewareMetadata,
} from '../internal/metadata';
import type { MiddlewareInput } from '../middleware/types';

const tc39ClassPattern = P.shape({ kind: 'class', metadata: P.nonNullable });

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const UseMiddleware =
  (...middlewares: MiddlewareInput[]) =>
  (...args: unknown[]): void => {
    const [, second] = args;

    const isClassDecorator = match(second)
      .with(P.nullish, () => true)
      .with(tc39ClassPattern, () => true)
      .otherwise(() => false);

    if (isClassDecorator) {
      const { cls } = resolveClassArgs(args);
      setControllerMiddlewareMetadata(cls, middlewares);
      return;
    }

    // Method decorator
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new ZeltDecoratorUsageError({
        decoratorName: 'UseMiddleware',
        reason: 'static_method',
      });
    }
    appendPendingMethodMiddlewareMetadata(pendingKey, methodName, middlewares);
  };
