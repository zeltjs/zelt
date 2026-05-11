import { afterEach, describe, expect, it, vi } from 'vitest';

import { Cron } from '../scheduler/decorators/cron';
import { Scheduled } from '../scheduler/decorators/scheduled';
import { createApp, type App } from '../app';
import type { SchedulerClass } from '../app/modules/scheduler-module';

describe('createApp with schedulers', () => {
  let app: App<{ http: { controllers: [] }; schedulers: SchedulerClass[] }> | undefined;

  afterEach(async () => {
    if (app) {
      await app.shutdown();
      app = undefined;
    }
  });

  it('accepts schedulers option', async () => {
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

    expect(app.shutdown).toBeDefined();
  });

  it('scheduler runs automatically after ready()', async () => {
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

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 2000 });
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
