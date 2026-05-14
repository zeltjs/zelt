import { ZeltDecoratorUsageError } from '../../errors';
import { resolveMethodArgs } from '../../internal/decorator-context';
import { appendPendingScheduleMetadata } from '../internal/scheduler-metadata';

type HourlyOptions = {
  readonly minute?: number;
  readonly tz?: string;
};

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const Hourly =
  (options?: HourlyOptions) =>
  (...args: unknown[]): void => {
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new ZeltDecoratorUsageError({ decoratorName: 'Hourly', reason: 'static_method' });
    }
    const minute = options?.minute ?? 0;
    const cronExpression = `${minute} * * * *`;
    appendPendingScheduleMetadata(pendingKey, {
      methodName,
      cronExpression,
      ...(options?.tz !== undefined ? { timezone: options.tz } : {}),
    });
  };
