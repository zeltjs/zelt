import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReadyApp } from '../../app';
import { createApp } from '../../app';
import { http } from '../http/http.feature';
import { Cron } from './schedule/cron.decorator';
import { Scheduled } from './schedule/scheduled.decorator';
import { scheduler } from './scheduler.feature';

describe('createApp with schedulers', () => {
  let readyApp:
    | ReadyApp<readonly [ReturnType<typeof http>, ReturnType<typeof scheduler>]>
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
    readyApp = await app.ready();

    expect(readyApp.schedulers.startScheduler).toBeDefined();
    expect(readyApp.schedulers.stopScheduler).toBeDefined();
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

    const app = createApp([http({ controllers: [] }), scheduler([TestScheduler])]);
    readyApp = await app.ready();

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
    readyApp = await app.ready();
    await readyApp.schedulers.startScheduler();

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

    const app = createApp([http({ controllers: [] }), scheduler([TestScheduler])]);
    readyApp = await app.ready();
    await readyApp.schedulers.startScheduler();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 2000 });

    const callCountBefore = taskFn.mock.calls.length;
    await readyApp.schedulers.stopScheduler();

    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(taskFn.mock.calls.length).toBe(callCountBefore);
  });

  it('works without schedulers option', async () => {
    const app = createApp([http({ controllers: [] })]);
    const localReadyApp = await app.ready();

    expect(localReadyApp.shutdown).toBeDefined();
    await localReadyApp.shutdown();
  });
});
