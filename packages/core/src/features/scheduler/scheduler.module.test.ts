import { afterEach, describe, expect, it, vi } from 'vitest';
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

  afterEach(async () => {
    if (readyApp) {
      await readyApp.schedulers.stopScheduler();
      await readyApp.shutdown();
      readyApp = undefined;
    }
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

    await new Promise((resolve) => setTimeout(resolve, 1500));
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

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 3000 });
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

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 3000 });

    const callCountBefore = taskFn.mock.calls.length;
    await readyApp.schedulers.stopScheduler();

    await new Promise((resolve) => setTimeout(resolve, 1500));
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
