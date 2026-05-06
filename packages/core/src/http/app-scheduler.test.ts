import { afterEach, describe, expect, it, vi } from 'vitest';

import { Cron } from '../decorators/cron';
import { Scheduled } from '../decorators/scheduled';

import { createHttpApp, type HttpApp } from './app';

describe('createHttpApp with schedulers', () => {
  let app: HttpApp | undefined;

  afterEach(async () => {
    if (app) {
      await app.stopScheduler();
      app = undefined;
    }
  });

  it('accepts schedulers option', () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 * * * *')
      hourlyTask() {}
    }

    app = createHttpApp({
      controllers: [],
      schedulers: [TestScheduler],
    });

    expect(app.startScheduler).toBeDefined();
    expect(app.stopScheduler).toBeDefined();
  });

  it('starts and stops scheduler', async () => {
    const taskFn = vi.fn();

    @Scheduled()
    class TestScheduler {
      @Cron('* * * * * *')
      everySecond() {
        taskFn();
      }
    }

    const localApp = createHttpApp({
      controllers: [],
      schedulers: [TestScheduler],
    });
    app = localApp;

    localApp.startScheduler();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 2000 });

    await localApp.stopScheduler();
    app = undefined;
  });

  it('works without schedulers option', () => {
    const localApp = createHttpApp({
      controllers: [],
    });
    app = localApp;

    expect(() => localApp.startScheduler()).not.toThrow();
  });
});
