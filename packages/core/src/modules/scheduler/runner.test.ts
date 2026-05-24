import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SchedulerApp } from '../../app';
import { createApp } from '../../app';
import { Controller } from '../../modules/http/decorators/controller';
import { Get } from '../../modules/http/decorators/http-method';

import { Cron } from './decorators/cron';
import { Scheduled } from './decorators/scheduled';

@Controller('/')
class NoopController {
  @Get('/health')
  health() {
    return { ok: true };
  }
}

describe('SchedulerRunner', () => {
  let app: SchedulerApp | undefined;

  afterEach(async () => {
    await app?.stopScheduler();
    await app?.shutdown();
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

    app = createApp({
      http: { controllers: [NoopController] },
      schedulers: [TestScheduler],
    });
    await app.ready();
    await app.startScheduler();

    await app.stopScheduler();
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

    app = createApp({
      http: { controllers: [NoopController] },
      schedulers: [TestScheduler],
    });
    await app.ready();
    await app.startScheduler();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 2000 });

    await app.stopScheduler();
  });

  it('respects timezone setting', async () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 9 * * *', { tz: 'Asia/Tokyo' })
      tokyoMorning() {}
    }

    app = createApp({
      http: { controllers: [NoopController] },
      schedulers: [TestScheduler],
    });
    await app.ready();
    await app.startScheduler();

    await app.stopScheduler();
  });
});
