import { describe, expect, it } from 'vitest';

import { getScheduleMetadata, resolveScheduleMetadata } from '../internal/scheduler-metadata';

import { Weekly } from './weekly';
import { Scheduled } from './scheduled';

describe('@Weekly', () => {
  it('converts day and hour to cron expression', () => {
    @Scheduled()
    class TestScheduler {
      @Weekly({ day: 'monday', hour: 9 })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.cronExpression).toBe('0 9 * * 1');
  });

  it('maps all days correctly', () => {
    const dayMap: Record<string, string> = {
      sunday: '0',
      monday: '1',
      tuesday: '2',
      wednesday: '3',
      thursday: '4',
      friday: '5',
      saturday: '6',
    };

    for (const [day, cronDay] of Object.entries(dayMap)) {
      class TestScheduler {
        task() {}
      }
      Weekly({ day: day as Parameters<typeof Weekly>[0]['day'], hour: 0 })(
        TestScheduler.prototype,
        'task',
      );
      resolveScheduleMetadata(TestScheduler.prototype, TestScheduler);
      const schedules = getScheduleMetadata(TestScheduler);
      expect(schedules[0]?.cronExpression).toBe(`0 0 * * ${cronDay}`);
    }
  });

  it('includes minute in cron expression', () => {
    @Scheduled()
    class TestScheduler {
      @Weekly({ day: 'friday', hour: 17, minute: 30 })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules[0]?.cronExpression).toBe('30 17 * * 5');
  });

  it('supports timezone option', () => {
    @Scheduled()
    class TestScheduler {
      @Weekly({ day: 'sunday', hour: 8, tz: 'America/New_York' })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules[0]?.timezone).toBe('America/New_York');
  });
});
