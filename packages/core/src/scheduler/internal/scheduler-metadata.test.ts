import { describe, expect, it } from 'vitest';

import {
  appendPendingScheduleMetadata,
  getScheduledMetadata,
  getScheduleMetadata,
  resolveScheduleMetadata,
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

  describe('appendPendingScheduleMetadata / getScheduleMetadata', () => {
    it('appends and retrieves schedule metadata with resolve', () => {
      const pendingKey = {};
      class TestScheduler {}
      appendPendingScheduleMetadata(pendingKey, {
        methodName: 'dailyTask',
        cronExpression: '0 3 * * *',
        timezone: 'Asia/Tokyo',
      });
      resolveScheduleMetadata(pendingKey, TestScheduler);

      const schedules = getScheduleMetadata(TestScheduler);
      expect(schedules).toHaveLength(1);
      expect(schedules[0]).toEqual({
        methodName: 'dailyTask',
        cronExpression: '0 3 * * *',
        timezone: 'Asia/Tokyo',
      });
    });

    it('appends multiple schedules with resolve', () => {
      const pendingKey = {};
      class TestScheduler {}
      appendPendingScheduleMetadata(pendingKey, {
        methodName: 'task1',
        cronExpression: '0 * * * *',
      });
      appendPendingScheduleMetadata(pendingKey, {
        methodName: 'task2',
        cronExpression: '0 0 * * *',
      });
      resolveScheduleMetadata(pendingKey, TestScheduler);

      const schedules = getScheduleMetadata(TestScheduler);
      expect(schedules).toHaveLength(2);
    });

    it('returns empty array for class without schedules', () => {
      class EmptyScheduler {}
      expect(getScheduleMetadata(EmptyScheduler)).toEqual([]);
    });
  });

  describe('scheduler pending/resolve pattern', () => {
    it('stores to pending and resolves to final', () => {
      const pendingKey = {};
      class TestClass {}
      const meta = { methodName: 'run', cronExpression: '* * * * *' };

      appendPendingScheduleMetadata(pendingKey, meta);
      resolveScheduleMetadata(pendingKey, TestClass);

      const result = getScheduleMetadata(TestClass);
      expect(result).toEqual([meta]);
    });

    it('handles multiple schedules on same pending key', () => {
      const pendingKey = {};
      class TestClass {}
      const meta1 = { methodName: 'a', cronExpression: '* * * * *' };
      const meta2 = { methodName: 'b', cronExpression: '0 * * * *' };

      appendPendingScheduleMetadata(pendingKey, meta1);
      appendPendingScheduleMetadata(pendingKey, meta2);
      resolveScheduleMetadata(pendingKey, TestClass);

      const result = getScheduleMetadata(TestClass);
      expect(result).toEqual([meta1, meta2]);
    });
  });
});
