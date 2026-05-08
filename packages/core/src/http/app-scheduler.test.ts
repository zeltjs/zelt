import { afterEach, describe, expect, it, vi } from 'vitest';

import { Cron } from '../decorators/cron';
import { Scheduled } from '../decorators/scheduled';

import { createHttpApp, type HttpApp } from './app';

describe('createHttpApp with schedulers', () => {
  let app: HttpApp | undefined;

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

    app = createHttpApp({
      controllers: [],
      schedulers: [TestScheduler],
    });
    await app.ready();

    expect(app.shutdown).toBeDefined();
    expect(app.startScheduler).toBeDefined();
    expect(app.stopScheduler).toBeDefined();
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

    app = createHttpApp({
      controllers: [],
      schedulers: [TestScheduler],
    });
    await app.ready();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('works without schedulers option', async () => {
    app = createHttpApp({
      controllers: [],
    });
    await app.ready();

    expect(app.shutdown).toBeDefined();
  });

  it('deprecated startScheduler/stopScheduler work for backward compatibility', async () => {
    const localApp = createHttpApp({
      controllers: [],
    });
    await localApp.ready();
    app = localApp;

    expect(() => localApp.startScheduler()).not.toThrow();
    await expect(localApp.stopScheduler()).resolves.toBeUndefined();
  });
});
