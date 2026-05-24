import { describe, expect, it } from 'vitest';

import { Cron } from './schedule/cron';
import { Daily } from './schedule/daily';
import { Scheduled } from './schedule/scheduled';

import { getScheduledMetadata, getScheduleMetadata } from './scheduler-metadata';

describe('scheduler-metadata (via decorators)', () => {
  it('getScheduledMetadata returns true for @Scheduled class', () => {
    @Scheduled()
    class TestScheduler {}
    expect(getScheduledMetadata(TestScheduler)).toBe(true);
  });

  it('getScheduledMetadata returns undefined for class without @Scheduled', () => {
    class UnmarkedClass {}
    expect(getScheduledMetadata(UnmarkedClass)).toBeUndefined();
  });

  it('getScheduleMetadata collects @Cron metadata', () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 3 * * *', { tz: 'Asia/Tokyo' })
      dailyTask(): void {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toEqual({
      methodName: 'dailyTask',
      cronExpression: '0 3 * * *',
      timezone: 'Asia/Tokyo',
    });
  });

  it('getScheduleMetadata collects multiple schedule decorators in declaration order', () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 * * * *')
      task1(): void {}

      @Daily({ hour: 0 })
      task2(): void {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules).toHaveLength(2);
    expect(schedules.map((s) => s.methodName)).toEqual(['task1', 'task2']);
  });

  it('getScheduleMetadata returns empty array for class without schedules', () => {
    class EmptyScheduler {}
    expect(getScheduleMetadata(EmptyScheduler)).toEqual([]);
  });
});
