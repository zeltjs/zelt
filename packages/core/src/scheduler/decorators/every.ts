import { ZeltDecoratorUsageError } from '../../errors';
import { resolveMethodArgs } from '../../internal/decorator-context';
import { appendPendingScheduleMetadata } from '../internal/scheduler-metadata';

type EveryOptions =
  | { readonly minutes: number; readonly seconds?: never }
  | { readonly seconds: number; readonly minutes?: never };

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const Every =
  (options: EveryOptions) =>
  (...args: unknown[]): void => {
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new ZeltDecoratorUsageError({ decoratorName: 'Every', reason: 'static_method' });
    }

    const cronExpression =
      options.seconds !== undefined
        ? `*/${options.seconds} * * * * *`
        : `*/${options.minutes} * * * *`;

    appendPendingScheduleMetadata(pendingKey, {
      methodName,
      cronExpression,
    });
  };
