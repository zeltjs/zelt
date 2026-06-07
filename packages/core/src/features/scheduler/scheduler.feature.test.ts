import { Container } from '@needle-di/core';
import { describe, expect, expectTypeOf, it } from 'vitest';

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
    const { staticCapabilities } = feature;

    expect(() => staticCapabilities()).not.toThrow();
  });

  it('returns a ConfiguredFeature with key "schedulers"', () => {
    const feature = scheduler([TestScheduler]);
    expect(feature.key).toBe('schedulers');
    expect(typeof feature.createCapabilities).toBe('function');
  });

  it('createCapabilities returns SchedulerCapabilities', async () => {
    const feature = scheduler([TestScheduler]);
    const container = new Container();
    const caps = await feature.createCapabilities(createRuntime(container));

    expect(typeof caps.startScheduler).toBe('function');
    expect(typeof caps.stopScheduler).toBe('function');
    expect(typeof caps.isSchedulerRunning).toBe('function');
    expect(typeof caps.getSchedulerJobs).toBe('function');
  });

  it('scheduler is not running by default', async () => {
    const feature = scheduler([TestScheduler]);
    const container = new Container();
    const caps = await feature.createCapabilities(createRuntime(container));

    expect(caps.isSchedulerRunning()).toBe(false);
  });
});
