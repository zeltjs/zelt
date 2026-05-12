import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../app';
import { createApp } from '../app';
import type { SchedulerClass } from '../app/modules/scheduler-module';
import { Cron } from '../scheduler/decorators/cron';
import { Scheduled } from '../scheduler/decorators/scheduled';

describe('createApp with schedulers', () => {
  let app: App<{ http: { controllers: [] }; schedulers: SchedulerClass[] }> | undefined;

  afterEach(async () => {
    if (app) {
      await app.stopScheduler();
      await app.shutdown();
      app = undefined;
    }
  });

  it('accepts schedulers option and provides scheduler methods', async () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 * * * *')
      hourlyTask() {}
    }

    app = createApp({
      http: { controllers: [] },
      schedulers: [TestScheduler],
    });
    await app.ready();

    expect(app.startScheduler).toBeDefined();
    expect(app.stopScheduler).toBeDefined();
  });

  it('scheduler does not run automatically after ready()', async () => {
    const taskFn = vi.fn();

    @Scheduled()
    class TestScheduler {
      @Cron('* * * * * *')
      everySecond() {
        taskFn();
      }
    }

    app = createApp({
      http: { controllers: [] },
      schedulers: [TestScheduler],
    });
    await app.ready();

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

    app = createApp({
      http: { controllers: [] },
      schedulers: [TestScheduler],
    });
    await app.ready();
    await app.startScheduler();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 2000 });
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

    app = createApp({
      http: { controllers: [] },
      schedulers: [TestScheduler],
    });
    await app.ready();
    await app.startScheduler();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 2000 });

    const callCountBefore = taskFn.mock.calls.length;
    await app.stopScheduler();

    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(taskFn.mock.calls.length).toBe(callCountBefore);
  });

  it('works without schedulers option', async () => {
    const localApp = createApp({
      http: { controllers: [] },
    });
    await localApp.ready();

    expect(localApp.shutdown).toBeDefined();
    await localApp.shutdown();
  });
});
