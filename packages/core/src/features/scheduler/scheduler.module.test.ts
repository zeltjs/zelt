import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { http } from '../http/http.feature';
import { Cron } from './schedule/cron.decorator';
import { Scheduled } from './schedule/scheduled.decorator';
import type { SchedulerCapabilities } from './scheduler.feature';
import { scheduler } from './scheduler.feature';

describe('createApp with schedulers', () => {
  let readyApp:
    | { readonly schedulers: SchedulerCapabilities; readonly shutdown: () => Promise<void> }
    | undefined;

  // Fixing the clock on a whole-second boundary makes '* * * * * *' fire at
  // exactly +1000ms instead of after a leftover fraction of the real second.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(async () => {
    if (readyApp) {
      await readyApp.schedulers.stopScheduler();
      await readyApp.shutdown();
      readyApp = undefined;
    }
    vi.useRealTimers();
  });

  it('accepts schedulers option and provides scheduler methods', async () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 * * * *')
      hourlyTask() {}
    }

    const app = createApp([http({ controllers: [] }), scheduler([TestScheduler])]);
    readyApp = await app.createRuntime();

    expect(readyApp.schedulers.startScheduler).toBeDefined();
    expect(readyApp.schedulers.stopScheduler).toBeDefined();
  });

  it('scheduler does not run automatically after createRuntime()', async () => {
    const taskFn = vi.fn();

    @Scheduled()
    class TestScheduler {
      @Cron('* * * * * *')
      everySecond() {
        taskFn();
      }
    }

    const app = createApp([http({ controllers: [] }), scheduler([TestScheduler])]);
    readyApp = await app.createRuntime();

    await vi.advanceTimersByTimeAsync(1500);
    expect(taskFn).not.toHaveBeenCalled();
  });

  it('scheduler runs after explicit startScheduler()', async () => {
    const taskFn = vi.fn();

    @Scheduled()
    class TestScheduler {
      @Cron('* * * * * *')
      everySecond() {
        taskFn();
      }
    }

    const app = createApp([http({ controllers: [] }), scheduler([TestScheduler])]);
    readyApp = await app.createRuntime();
    await readyApp.schedulers.startScheduler();

    await vi.advanceTimersByTimeAsync(1000);
    expect(taskFn).toHaveBeenCalledTimes(1);
  });

  it('stopScheduler() stops scheduled tasks', async () => {
    const taskFn = vi.fn();

    @Scheduled()
    class TestScheduler {
      @Cron('* * * * * *')
      everySecond() {
        taskFn();
      }
    }

    const app = createApp([http({ controllers: [] }), scheduler([TestScheduler])]);
    readyApp = await app.createRuntime();
    await readyApp.schedulers.startScheduler();

    await vi.advanceTimersByTimeAsync(1000);
    expect(taskFn).toHaveBeenCalledTimes(1);

    const callCountBefore = taskFn.mock.calls.length;
    await readyApp.schedulers.stopScheduler();

    await vi.advanceTimersByTimeAsync(1500);
    expect(taskFn.mock.calls.length).toBe(callCountBefore);
  });

  it('shutdown() stops a running scheduler without explicit stopScheduler()', async () => {
    @Scheduled()
    class TestScheduler {
      @Cron('* * * * * *')
      everySecond() {}
    }

    const app = createApp([http({ controllers: [] }), scheduler([TestScheduler])]);
    readyApp = await app.createRuntime();
    await readyApp.schedulers.startScheduler();
    expect(readyApp.schedulers.isSchedulerRunning()).toBe(true);

    await readyApp.shutdown();

    expect(readyApp.schedulers.isSchedulerRunning()).toBe(false);
  });

  it('works without schedulers option', async () => {
    const app = createApp([http({ controllers: [] })]);
    const localRuntimeApp = await app.createRuntime();

    expect(localRuntimeApp.shutdown).toBeDefined();
    await localRuntimeApp.shutdown();
  });
});
