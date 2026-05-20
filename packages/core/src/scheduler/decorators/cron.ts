import { defineMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../errors';
import { getCallerPositionForCore } from '../../internal/decorator-position';

type CronOptions = {
  readonly tz?: string;
};

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const Cron = (expression: string, options?: CronOptions) =>
  defineMethodDecorator(
    getCallerPositionForCore(),
    {
      decorator: 'Schedule' as const,
      cronExpression: expression,
      ...(options?.tz !== undefined ? { timezone: options.tz } : {}),
    } as const,
    {
      rejectStatic: () =>
        new ZeltDecoratorUsageError({ decoratorName: 'Cron', reason: 'static_method' }),
    },
  );
