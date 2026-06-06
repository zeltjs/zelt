import { describe, expect, it } from 'vitest';

import { getScheduleMetadata } from '../index';

import { Every } from './every.decorator';
import { Scheduled } from './scheduled.decorator';

describe('@Every', () => {
  it('generates interval cron for minutes', () => {
    @Scheduled()
    class TestScheduler {
      @Every({ minutes: 5 })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.cronExpression).toBe('*/5 * * * *');
  });

  it('generates interval cron for seconds', () => {
    @Scheduled()
    class TestScheduler {
      @Every({ seconds: 30 })
      task() {}
    }

    const schedules = getScheduleMetadata(TestScheduler);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.cronExpression).toBe('*/30 * * * * *');
  });
});
