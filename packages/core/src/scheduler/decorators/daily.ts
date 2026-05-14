import { ZeltDecoratorUsageError } from '../../errors';
import { resolveMethodArgs } from '../../internal/decorator-context';
import { appendPendingScheduleMetadata } from '../internal/scheduler-metadata';

type DailyOptions = {
  readonly hour: number;
  readonly minute?: number;
  readonly tz?: string;
};

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const Daily =
  (options: DailyOptions) =>
  (...args: unknown[]): void => {
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new ZeltDecoratorUsageError({ decoratorName: 'Daily', reason: 'static_method' });
    }
    const minute = options.minute ?? 0;
    const cronExpression = `${minute} ${options.hour} * * *`;
    appendPendingScheduleMetadata(pendingKey, {
      methodName,
      cronExpression,
      ...(options.tz !== undefined ? { timezone: options.tz } : {}),
    });
  };
