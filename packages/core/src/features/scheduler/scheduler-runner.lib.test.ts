import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { http } from '../http/http.feature';
import { Controller } from '../http/routing/controller.decorator';
import { Get } from '../http/routing/http-method.decorator';
import { Cron } from './schedule/cron.decorator';
import { Scheduled } from './schedule/scheduled.decorator';
import type { SchedulerCapabilities } from './scheduler.feature';
import { scheduler } from './scheduler.feature';

@Controller('/')
class NoopController {
  @Get('/health')
  health() {
    return { ok: true };
  }
}

describe('SchedulerRunner', () => {
  let readyApp:
    | { readonly scheduler: SchedulerCapabilities; readonly shutdown: () => Promise<void> }
    | undefined;

  // Fixing the clock on a whole-second boundary makes '* * * * * *' fire at
  // exactly +1000ms instead of after a leftover fraction of the real second.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(async () => {
    if (readyApp) {
      await readyApp.scheduler.stopScheduler();
      await readyApp.shutdown();
      readyApp = undefined;
    }
    vi.useRealTimers();
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
    readyApp = await app.createRuntime();

    expect(readyApp.scheduler.isSchedulerRunning()).toBe(false);

    await readyApp.scheduler.startScheduler();

    expect(readyApp.scheduler.isSchedulerRunning()).toBe(true);
    expect(readyApp.scheduler.getSchedulerJobs()).toHaveLength(1);
    expect(readyApp.scheduler.getSchedulerJobs()[0]).toEqual({
      name: 'everySecond',
      cronExpression: '* * * * * *',
      timezone: undefined,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(taskFn).toHaveBeenCalledTimes(1);

    await readyApp.scheduler.stopScheduler();

    expect(readyApp.scheduler.isSchedulerRunning()).toBe(false);
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
    readyApp = await app.createRuntime();
    await readyApp.scheduler.startScheduler();

    await vi.advanceTimersByTimeAsync(1000);
    expect(taskFn).toHaveBeenCalledTimes(1);

    await readyApp.scheduler.stopScheduler();
  });

  it('respects timezone setting', async () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 9 * * *', { tz: 'Asia/Tokyo' })
      tokyoMorning() {}
    }

    const app = createApp([http({ controllers: [NoopController] }), scheduler([TestScheduler])]);
    readyApp = await app.createRuntime();

    expect(readyApp.scheduler.isSchedulerRunning()).toBe(false);

    await readyApp.scheduler.startScheduler();

    expect(readyApp.scheduler.isSchedulerRunning()).toBe(true);
    expect(readyApp.scheduler.getSchedulerJobs()).toHaveLength(1);
    expect(readyApp.scheduler.getSchedulerJobs()[0]).toEqual({
      name: 'tokyoMorning',
      cronExpression: '0 9 * * *',
      timezone: 'Asia/Tokyo',
    });

    await readyApp.scheduler.stopScheduler();

    expect(readyApp.scheduler.isSchedulerRunning()).toBe(false);
  });

  it('inherits schedules from an undecorated base and honors method overrides', async () => {
    const calls: string[] = [];
    abstract class Tasks {
      readonly label = 'base';
      @Cron('* * * * * *')
      inherited() {
        calls.push(this.label);
      }
      @Cron('* * * * * *')
      removed() {
        calls.push('removed');
      }
      @Cron('* * * * * *')
      replaced() {
        calls.push('parent');
      }
    }
    @Scheduled()
    class ChildTasks extends Tasks {
      override removed() {
        calls.push('unrouted');
      }
      @Cron('*/2 * * * * *')
      override replaced() {
        calls.push('child');
      }
    }
    readyApp = await createApp([scheduler([ChildTasks])]).createRuntime();
    await readyApp.scheduler.startScheduler();
    expect(readyApp.scheduler.getSchedulerJobs()).toEqual([
      { name: 'replaced', cronExpression: '*/2 * * * * *', timezone: undefined },
      { name: 'inherited', cronExpression: '* * * * * *', timezone: undefined },
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual(['base']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.filter((call) => call === 'base')).toHaveLength(2);
    expect(calls.filter((call) => call === 'child')).toHaveLength(1);
    expect(calls).not.toContain('parent');
    expect(calls).not.toContain('removed');
    expect(calls).not.toContain('unrouted');
  });

  it('does not inherit the Scheduled class decorator', async () => {
    const calls: string[] = [];
    @Scheduled()
    class ParentTasks {
      @Cron('* * * * * *')
      tick() {
        calls.push('tick');
      }
    }
    class UnscheduledChild extends ParentTasks {}
    readyApp = await createApp([scheduler([UnscheduledChild])]).createRuntime();
    await readyApp.scheduler.startScheduler();
    expect(readyApp.scheduler.getSchedulerJobs()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual([]);
  });
});
