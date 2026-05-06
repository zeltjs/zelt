import { describe, expect, it } from 'vitest';

import {
  appendScheduleMetadata,
  getScheduledMetadata,
  getScheduleMetadata,
  setScheduledMetadata,
} from './scheduler-metadata';

describe('scheduler-metadata', () => {
  describe('setScheduledMetadata / getScheduledMetadata', () => {
    it('stores and retrieves scheduled class marker', () => {
      class TestScheduler {}
      setScheduledMetadata(TestScheduler);
      expect(getScheduledMetadata(TestScheduler)).toBe(true);
    });

    it('returns undefined for unmarked class', () => {
      class UnmarkedClass {}
      expect(getScheduledMetadata(UnmarkedClass)).toBeUndefined();
    });
  });

  describe('appendScheduleMetadata / getScheduleMetadata', () => {
    it('appends and retrieves schedule metadata', () => {
      class TestScheduler {}
      appendScheduleMetadata(TestScheduler, {
        methodName: 'dailyTask',
        cronExpression: '0 3 * * *',
        timezone: 'Asia/Tokyo',
      });

      const schedules = getScheduleMetadata(TestScheduler);
      expect(schedules).toHaveLength(1);
      expect(schedules[0]).toEqual({
        methodName: 'dailyTask',
        cronExpression: '0 3 * * *',
        timezone: 'Asia/Tokyo',
      });
    });

    it('appends multiple schedules', () => {
      class TestScheduler {}
      appendScheduleMetadata(TestScheduler, {
        methodName: 'task1',
        cronExpression: '0 * * * *',
      });
      appendScheduleMetadata(TestScheduler, {
        methodName: 'task2',
        cronExpression: '0 0 * * *',
      });

      const schedules = getScheduleMetadata(TestScheduler);
      expect(schedules).toHaveLength(2);
    });

    it('returns empty array for class without schedules', () => {
      class EmptyScheduler {}
      expect(getScheduleMetadata(EmptyScheduler)).toEqual([]);
    });
  });
});
