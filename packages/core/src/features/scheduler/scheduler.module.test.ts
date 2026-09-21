import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { Config } from '../../built-in-service';
import { http } from '../http/http.feature';
import type { CronJobHandle, CronJobOptions } from './cron.adaptor';
import { CronAdaptor } from './cron.adaptor';
import { Cron } from './schedule/cron.decorator';
import { Scheduled } from './schedule/scheduled.decorator';
import type { SchedulerCapabilities } from './scheduler.feature';
import { scheduler } from './scheduler.feature';

/**
 * Fakes CronAdaptor so tests trigger scheduled handlers synchronously instead
 * of waiting on real cron ticks, which is what made these tests flaky in CI.
 */
@Config
class ManualCronAdaptor extends CronAdaptor {
  readonly handlers: (() => void)[] = [];

  override schedule(
    _expression: string,
    _options: CronJobOptions,
    handler: () => void,
  ): CronJobHandle {
    this.handlers.push(handler);
    return {
      stop: () => {
        const index = this.handlers.indexOf(handler);
        if (index !== -1) this.handlers.splice(index, 1);
      },
    };
  }

  fire(): void {
    // Copy first: a handler may call stop() synchronously, which mutates
    // handlers mid-iteration and would otherwise skip entries.
    for (const handler of this.handlers.slice()) handler();
  }
}

describe('createApp with schedulers', () => {
  let readyApp:
    | {
        readonly schedulers: SchedulerCapabilities;
        readonly shutdown: () => Promise<void>;
        readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
      }
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
    readyApp = await app.createRuntime({ configs: [ManualCronAdaptor] });

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
    readyApp = await app.createRuntime({ configs: [ManualCronAdaptor] });
    const cronAdaptor = await readyApp.get(ManualCronAdaptor);

    expect(cronAdaptor.handlers).toHaveLength(0);
    cronAdaptor.fire();
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
    readyApp = await app.createRuntime({ configs: [ManualCronAdaptor] });
    const cronAdaptor = await readyApp.get(ManualCronAdaptor);
    await readyApp.schedulers.startScheduler();

    cronAdaptor.fire();

    expect(taskFn).toHaveBeenCalled();
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
    readyApp = await app.createRuntime({ configs: [ManualCronAdaptor] });
    const cronAdaptor = await readyApp.get(ManualCronAdaptor);
    await readyApp.schedulers.startScheduler();

    await readyApp.schedulers.stopScheduler();

    expect(cronAdaptor.handlers).toHaveLength(0);
    cronAdaptor.fire();
    expect(taskFn).not.toHaveBeenCalled();
  });

  it('shutdown() stops a running scheduler without explicit stopScheduler()', async () => {
    @Scheduled()
    class TestScheduler {
      @Cron('* * * * * *')
      everySecond() {}
    }

    const app = createApp([http({ controllers: [] }), scheduler([TestScheduler])]);
    readyApp = await app.createRuntime({ configs: [ManualCronAdaptor] });
    const cronAdaptor = await readyApp.get(ManualCronAdaptor);
    await readyApp.schedulers.startScheduler();
    expect(readyApp.schedulers.isSchedulerRunning()).toBe(true);

    await readyApp.shutdown();

    expect(readyApp.schedulers.isSchedulerRunning()).toBe(false);
    expect(cronAdaptor.handlers).toHaveLength(0);
  });

  it('works without schedulers option', async () => {
    const app = createApp([http({ controllers: [] })]);
    const localRuntimeApp = await app.createRuntime();

    expect(localRuntimeApp.shutdown).toBeDefined();
    await localRuntimeApp.shutdown();
  });
});
