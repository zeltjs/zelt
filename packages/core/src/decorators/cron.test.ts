import { describe, expect, it } from 'vitest';

import { getScheduleMetadata } from '../internal/scheduler-metadata';

import { Cron } from './cron';

describe('@Cron', () => {
  it('registers cron expression for method', () => {
    class TestScheduler {
      @Cron('0 3 * * *')
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toEqual({
      methodName: 'task',
      cronExpression: '0 3 * * *',
      timezone: undefined,
    });
  });

  it('supports timezone option', () => {
    class TestScheduler {
      @Cron('0 3 * * *', { tz: 'Asia/Tokyo' })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules[0]?.timezone).toBe('Asia/Tokyo');
  });

  it('throws when applied to static method', () => {
    expect(() => {
      class S {
        @Cron('0 3 * * *')
        static task() {}
      }
      void S;
    }).toThrow(/static/);
  });
});
