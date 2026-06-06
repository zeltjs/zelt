import { createMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel';

type CronOptions = {
  readonly tz?: string;
};

/** @throws {E} */
export const Cron = (expression: string, options?: CronOptions) =>
  createMethodDecorator(
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
