import { Container } from '@needle-di/core';
import { afterEach, describe, expect, it } from 'vitest';

import { LifecycleManager } from '../kernel';
import { Cron } from '../modules/scheduler/schedule/cron.decorator';
import { Scheduled } from '../modules/scheduler/schedule/scheduled.decorator';
import { scheduler } from './scheduler.feature';

@Scheduled()
class TestScheduler {
  @Cron('0 0 * * *')
  dailyTask() {}
}

describe('scheduler feature', () => {
  let container: Container | undefined;

  afterEach(async () => {
    if (container) {
      const lifecycle = container.get(LifecycleManager);
      await lifecycle.shutdown();
      container = undefined;
    }
  });

  it('returns a ConfiguredFeature with key "schedulers"', () => {
    const feature = scheduler([TestScheduler]);
    expect(feature.key).toBe('schedulers');
    expect(typeof feature.bind).toBe('function');
    expect(typeof feature.resolve).toBe('function');
  });

  it('resolve returns SchedulerCapabilities', async () => {
    const feature = scheduler([TestScheduler]);
    container = new Container();
    feature.bind(container);
    const caps = feature.resolve(container);

    const lifecycle = container.get(LifecycleManager);
    await lifecycle.warmup();
    await lifecycle.startup();

    expect(typeof caps.startScheduler).toBe('function');
    expect(typeof caps.stopScheduler).toBe('function');
    expect(typeof caps.isSchedulerRunning).toBe('function');
    expect(typeof caps.getSchedulerJobs).toBe('function');
  });

  it('scheduler is not running by default after startup', async () => {
    const feature = scheduler([TestScheduler]);
    container = new Container();
    feature.bind(container);
    const caps = feature.resolve(container);

    const lifecycle = container.get(LifecycleManager);
    await lifecycle.warmup();
    await lifecycle.startup();

    expect(caps.isSchedulerRunning()).toBe(false);
  });
});
