import { createMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel/errors';

type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

type WeeklyOptions = {
  readonly day: DayOfWeek;
  readonly hour: number;
  readonly minute?: number;
  readonly tz?: string;
};

const dayToCron: Record<DayOfWeek, string> = {
  sunday: '0',
  monday: '1',
  tuesday: '2',
  wednesday: '3',
  thursday: '4',
  friday: '5',
  saturday: '6',
};

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const Weekly = (options: WeeklyOptions) => {
  const minute = options.minute ?? 0;
  const cronDay = dayToCron[options.day];
  const cronExpression = `${minute} ${options.hour} * * ${cronDay}`;
  return createMethodDecorator(
    {
      decorator: 'Schedule' as const,
      cronExpression,
      ...(options.tz !== undefined ? { timezone: options.tz } : {}),
    } as const,
    {
      rejectStatic: () =>
        new ZeltDecoratorUsageError({ decoratorName: 'Weekly', reason: 'static_method' }),
    },
  );
};
