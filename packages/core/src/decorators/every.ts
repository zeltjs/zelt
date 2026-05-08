import { resolveMethodArgs } from '../internal/decorator-context';
import { appendPendingScheduleMetadata } from '../internal/scheduler-metadata';

type EveryOptions =
  | { readonly minutes: number; readonly seconds?: never }
  | { readonly seconds: number; readonly minutes?: never };

export const Every =
  (options: EveryOptions) =>
  (...args: unknown[]): void => {
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new Error('@Every cannot be applied to static methods');
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
