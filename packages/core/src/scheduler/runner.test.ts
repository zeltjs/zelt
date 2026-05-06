import { afterEach, describe, expect, it, vi } from 'vitest';

import { Cron } from '../decorators/cron';
import { Scheduled } from '../decorators/scheduled';
import { createContainer } from '../internal/container';

import { type SchedulerRunner, createSchedulerRunner } from './runner';

describe('SchedulerRunner', () => {
  let runner: SchedulerRunner | undefined;

  afterEach(async () => {
    await runner?.stop();
  });

  it('starts and stops scheduler jobs', async () => {
    const taskFn = vi.fn();

    @Scheduled()
    class TestScheduler {
      @Cron('* * * * * *')
      everySecond() {
        taskFn();
      }
    }

    const resolver = createContainer();
    runner = createSchedulerRunner([TestScheduler], resolver);

    runner.start();
    expect(runner.isRunning()).toBe(true);

    await runner.stop();
    expect(runner.isRunning()).toBe(false);
  });

  it('executes scheduled method', async () => {
    const taskFn = vi.fn();

    @Scheduled()
    class TestScheduler {
      @Cron('* * * * * *')
      everySecond() {
        taskFn();
      }
    }

    const resolver = createContainer();
    runner = createSchedulerRunner([TestScheduler], resolver);

    runner.start();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 2000 });

    await runner.stop();
  });

  it('respects timezone setting', async () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 9 * * *', { tz: 'Asia/Tokyo' })
      tokyoMorning() {}
    }

    const resolver = createContainer();
    runner = createSchedulerRunner([TestScheduler], resolver);

    runner.start();
    const jobs = runner.getJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.timezone).toBe('Asia/Tokyo');

    await runner.stop();
  });
});
