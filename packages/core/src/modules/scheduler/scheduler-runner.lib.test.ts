import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReadyApp } from '../../app';
import { createApp } from '../../app';
import { http } from '../../features/http.feature';
import { scheduler } from '../../features/scheduler.feature';
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
  let readyApp:
    | ReadyApp<readonly [ReturnType<typeof http>, ReturnType<typeof scheduler>]>
    | undefined;

  afterEach(async () => {
    if (readyApp) {
      await readyApp.schedulers.stopScheduler();
      await readyApp.shutdown();
    }
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

    const app = createApp([http({ controllers: [NoopController] }), scheduler([TestScheduler])]);
    readyApp = await app.ready();

    expect(readyApp.schedulers.isSchedulerRunning()).toBe(false);

    await readyApp.schedulers.startScheduler();

    expect(readyApp.schedulers.isSchedulerRunning()).toBe(true);
    expect(readyApp.schedulers.getSchedulerJobs()).toHaveLength(1);
    expect(readyApp.schedulers.getSchedulerJobs()[0]).toEqual({
      name: 'everySecond',
      cronExpression: '* * * * * *',
      timezone: undefined,
    });

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 3000 });

    await readyApp.schedulers.stopScheduler();

    expect(readyApp.schedulers.isSchedulerRunning()).toBe(false);
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

    const app = createApp([http({ controllers: [NoopController] }), scheduler([TestScheduler])]);
    readyApp = await app.ready();
    await readyApp.schedulers.startScheduler();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 3000 });

    await readyApp.schedulers.stopScheduler();
  });

  it('respects timezone setting', async () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 9 * * *', { tz: 'Asia/Tokyo' })
      tokyoMorning() {}
    }

    const app = createApp([http({ controllers: [NoopController] }), scheduler([TestScheduler])]);
    readyApp = await app.ready();

    expect(readyApp.schedulers.isSchedulerRunning()).toBe(false);

    await readyApp.schedulers.startScheduler();

    expect(readyApp.schedulers.isSchedulerRunning()).toBe(true);
    expect(readyApp.schedulers.getSchedulerJobs()).toHaveLength(1);
    expect(readyApp.schedulers.getSchedulerJobs()[0]).toEqual({
      name: 'tokyoMorning',
      cronExpression: '0 9 * * *',
      timezone: 'Asia/Tokyo',
    });

    await readyApp.schedulers.stopScheduler();

    expect(readyApp.schedulers.isSchedulerRunning()).toBe(false);
  });
});
