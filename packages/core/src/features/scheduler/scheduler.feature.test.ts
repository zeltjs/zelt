import { Container } from '@needle-di/core';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';

import { LifecycleManager } from '../../kernel';
import { Cron } from './schedule/cron.decorator';
import { Scheduled } from './schedule/scheduled.decorator';
import { SchedulerFeature, scheduler } from './scheduler.feature';

const createRuntime = (container: Container) => ({
  get: async <T extends object>(cls: new (...args: never[]) => T): Promise<T> => container.get(cls),
});

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

  it('scheduler() returns SchedulerFeature instance', () => {
    const feature = scheduler([TestScheduler]);

    expect(feature).toBeInstanceOf(SchedulerFeature);
    expect(feature.key).toBe('schedulers');
  });

  it('infers scheduler() as SchedulerFeature', () => {
    expectTypeOf(scheduler([TestScheduler])).toEqualTypeOf<SchedulerFeature>();
  });

  it('keeps feature methods callable when destructured', () => {
    const feature = scheduler([TestScheduler]);
    const { bind } = feature;
    const testContainer = new Container();
    container = testContainer;

    expect(() => bind(testContainer)).not.toThrow();
  });

  it('returns a ConfiguredFeature with key "schedulers"', () => {
    const feature = scheduler([TestScheduler]);
    expect(feature.key).toBe('schedulers');
    expect(typeof feature.bind).toBe('function');
    expect(typeof feature.createCapabilities).toBe('function');
  });

  it('createCapabilities returns SchedulerCapabilities', async () => {
    const feature = scheduler([TestScheduler]);
    container = new Container();
    feature.bind(container);
    const caps = await feature.createCapabilities(createRuntime(container));

    const lifecycle = container.get(LifecycleManager);
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
    const caps = await feature.createCapabilities(createRuntime(container));

    const lifecycle = container.get(LifecycleManager);
    await lifecycle.startup();

    expect(caps.isSchedulerRunning()).toBe(false);
  });
});
