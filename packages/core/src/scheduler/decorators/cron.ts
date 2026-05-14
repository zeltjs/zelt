import { ZeltDecoratorUsageError } from '../../errors';
import { resolveMethodArgs } from '../../internal/decorator-context';
import { appendPendingScheduleMetadata } from '../internal/scheduler-metadata';

type CronOptions = {
  readonly tz?: string;
};

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const Cron =
  (expression: string, options?: CronOptions) =>
  (...args: unknown[]): void => {
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new ZeltDecoratorUsageError({ decoratorName: 'Cron', reason: 'static_method' });
    }
    appendPendingScheduleMetadata(pendingKey, {
      methodName,
      cronExpression: expression,
      ...(options?.tz !== undefined ? { timezone: options.tz } : {}),
    });
  };
