import { appendScheduleMetadata } from '../internal/scheduler-metadata';

type CronOptions = {
  readonly tz?: string;
};

export const Cron =
  (expression: string, options?: CronOptions): MethodDecorator =>
  (target, propertyKey): void => {
    if (typeof target === 'function') {
      throw new Error('@Cron cannot be applied to static methods');
    }
    appendScheduleMetadata(target.constructor, {
      methodName: propertyKey,
      cronExpression: expression,
      ...(options?.tz !== undefined ? { timezone: options.tz } : {}),
    });
  };
