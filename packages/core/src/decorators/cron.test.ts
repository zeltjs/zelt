import { describe, expect, it } from 'vitest';

import { getScheduleMetadata } from '../internal/scheduler-metadata';

import { Cron } from './cron';
import { Scheduled } from './scheduled';

describe('@Cron', () => {
  it('registers cron expression for method', () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 3 * * *')
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toEqual({
      methodName: 'task',
      cronExpression: '0 3 * * *',
    });
  });

  it('supports timezone option', () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 3 * * *', { tz: 'Asia/Tokyo' })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules[0]?.timezone).toBe('Asia/Tokyo');
  });

  it('throws when applied to static method', () => {
    expect(() => {
      @Scheduled()
      class S {
        @Cron('0 3 * * *')
        static task() {}
      }
      void S;
    }).toThrow(/static/);
  });
});
