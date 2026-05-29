import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SchedulerApp } from '../../app';
import { createApp } from '../../app';
import { Controller } from '../http/routing/controller.decorator';
import { Get } from '../http/routing/http-method.decorator';

import { Cron } from './schedule/cron.decorator';
import { Scheduled } from './schedule/scheduled.decorator';

@Controller('/')
class NoopController {
  @Get('/health')
  health() {
    return { ok: true };
  }
}

describe('SchedulerRunner', () => {
  let app: SchedulerApp | undefined;

  afterEach(async () => {
    await app?.stopScheduler();
    await app?.shutdown();
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

    app = createApp({
      http: { controllers: [NoopController] },
      schedulers: [TestScheduler],
    });
    await app.ready();

    expect(app.isSchedulerRunning()).toBe(false);

    await app.startScheduler();

    expect(app.isSchedulerRunning()).toBe(true);
    expect(app.getSchedulerJobs()).toHaveLength(1);
    expect(app.getSchedulerJobs()[0]).toEqual({
      name: 'everySecond',
      cronExpression: '* * * * * *',
      timezone: undefined,
    });

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 3000 });

    await app.stopScheduler();

    expect(app.isSchedulerRunning()).toBe(false);
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

    app = createApp({
      http: { controllers: [NoopController] },
      schedulers: [TestScheduler],
    });
    await app.ready();
    await app.startScheduler();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 3000 });

    await app.stopScheduler();
  });

  it('respects timezone setting', async () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 9 * * *', { tz: 'Asia/Tokyo' })
      tokyoMorning() {}
    }

    app = createApp({
      http: { controllers: [NoopController] },
      schedulers: [TestScheduler],
    });
    await app.ready();

    expect(app.isSchedulerRunning()).toBe(false);

    await app.startScheduler();

    expect(app.isSchedulerRunning()).toBe(true);
    expect(app.getSchedulerJobs()).toHaveLength(1);
    expect(app.getSchedulerJobs()[0]).toEqual({
      name: 'tokyoMorning',
      cronExpression: '0 9 * * *',
      timezone: 'Asia/Tokyo',
    });

    await app.stopScheduler();

    expect(app.isSchedulerRunning()).toBe(false);
  });
});
