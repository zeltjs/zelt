import { describe, expect, it } from 'vitest';

import { getScheduleMetadata } from '../internal/scheduler-metadata';

import { Every } from './every';

describe('@Every', () => {
  it('generates interval cron for minutes', () => {
    class TestScheduler {
      @Every({ minutes: 5 })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.cronExpression).toBe('*/5 * * * *');
  });

  it('generates interval cron for seconds', () => {
    class TestScheduler {
      @Every({ seconds: 30 })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.cronExpression).toBe('*/30 * * * * *');
  });
});
