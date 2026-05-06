import { describe, expect, it } from 'vitest';

import { getScheduleMetadata } from '../internal/scheduler-metadata';

import { Daily } from './daily';

describe('@Daily', () => {
  it('converts hour to cron expression', () => {
    class TestScheduler {
      @Daily({ hour: 3 })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.cronExpression).toBe('0 3 * * *');
  });

  it('includes minute in cron expression', () => {
    class TestScheduler {
      @Daily({ hour: 14, minute: 30 })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules[0]?.cronExpression).toBe('30 14 * * *');
  });

  it('supports timezone option', () => {
    class TestScheduler {
      @Daily({ hour: 9, tz: 'Asia/Tokyo' })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules[0]?.timezone).toBe('Asia/Tokyo');
  });

  it('defaults minute to 0', () => {
    class TestScheduler {
      @Daily({ hour: 6 })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules[0]?.cronExpression).toBe('0 6 * * *');
  });
});
