import { describe, expect, it } from 'vitest';

import { getScheduleMetadata } from '../internal/scheduler-metadata';

import { Hourly } from './hourly';

describe('@Hourly', () => {
  it('generates hourly cron expression with default minute 0', () => {
    class TestScheduler {
      @Hourly()
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.cronExpression).toBe('0 * * * *');
  });

  it('includes specified minute', () => {
    class TestScheduler {
      @Hourly({ minute: 15 })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules[0]?.cronExpression).toBe('15 * * * *');
  });

  it('supports timezone option', () => {
    class TestScheduler {
      @Hourly({ tz: 'Europe/London' })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules[0]?.timezone).toBe('Europe/London');
  });
});
