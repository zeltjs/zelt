import { afterEach, describe, expect, it, vi } from 'vitest';

import { createContainer } from '../../kernel/di/container';

import { Cron } from './decorators/cron';
import { Scheduled } from './decorators/scheduled';
import type { SchedulerRunner } from './runner';
import { createSchedulerRunner } from './runner';

describe('SchedulerRunner', () => {
  let runner: SchedulerRunner | undefined;

  afterEach(async () => {
    await runner?.shutdown();
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

    await runner.startup();
    expect(runner.isRunning()).toBe(true);

    await runner.shutdown();
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

    await runner.startup();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 2000 });

    await runner.shutdown();
  });

  it('respects timezone setting', async () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 9 * * *', { tz: 'Asia/Tokyo' })
      tokyoMorning() {}
    }

    const resolver = createContainer();
    runner = createSchedulerRunner([TestScheduler], resolver);

    await runner.startup();
    const jobs = runner.getJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.timezone).toBe('Asia/Tokyo');

    await runner.shutdown();
  });
});
