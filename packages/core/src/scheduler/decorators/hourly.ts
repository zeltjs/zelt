import { defineMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../errors';
import { captureStackTraceForCore } from '../../internal/decorator-position';

type HourlyOptions = {
  readonly minute?: number;
  readonly tz?: string;
};

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const Hourly = (options?: HourlyOptions) => {
  const minute = options?.minute ?? 0;
  const cronExpression = `${minute} * * * *`;
  return defineMethodDecorator(
    captureStackTraceForCore(),
    {
      decorator: 'Schedule' as const,
      cronExpression,
      ...(options?.tz !== undefined ? { timezone: options.tz } : {}),
    } as const,
    {
      rejectStatic: () =>
        new ZeltDecoratorUsageError({ decoratorName: 'Hourly', reason: 'static_method' }),
    },
  );
};
