import { describe, expect, it, vi } from 'vitest';
import { Injectable, inject, LifecycleManager } from '../kernel';
import { createApp } from './create-app.lib';
import type { ServiceResolver } from './feature.types';
import { injectFeature } from './inject-feature.lib';

describe('feature lifecycle regressions', () => {
  it('starts lazily resolved resources and rejects captured resolvers after shutdown', async () => {
    const started = vi.fn();
    const constructed = vi.fn();
    @Injectable()
    class Resource {
      constructor(lifecycle = inject(LifecycleManager)) {
        constructed();
        lifecycle.register({ startup: started, shutdown: () => {} });
      }
    }
    const feature = {
      key: 'lazy' as const,
      blueprint: () => ({}),
      featureClasses: () => [],
      realize: async ({ get }: ServiceResolver) => ({ resource: () => get(Resource) }),
    };
    const runtime = await createApp([feature]).createRuntime({ warmup: false });
    try {
      expect(constructed).not.toHaveBeenCalled();
      const resource = await runtime.lazy.resource();
      expect(started).toHaveBeenCalledOnce();
      expect(await runtime.lazy.resource()).toBe(resource);
      expect(started).toHaveBeenCalledOnce();
      await runtime.shutdown();
      await expect(runtime.lazy.resource()).rejects.toThrow(/shutdown/);
      expect(constructed).toHaveBeenCalledOnce();
    } finally {
      await runtime.shutdown();
    }
  });

  it('rejects an escaped resolver after initialization fails', async () => {
    const constructed = vi.fn();
    @Injectable()
    class Resource {
      constructor() {
        constructed();
      }
    }
    let escaped: ServiceResolver['get'] | undefined;
    const feature = {
      key: 'broken' as const,
      blueprint: () => ({}),
      featureClasses: () => [],
      realize: async ({ get }: ServiceResolver) => {
        escaped = get;
        throw new Error('initialization failed');
      },
    };
    await expect(createApp([feature]).createRuntime()).rejects.toThrow('initialization failed');
    if (escaped === undefined) throw new Error('Expected the resolver to be captured');
    await expect(escaped(Resource)).rejects.toThrow(/shutdown/);
    expect(constructed).not.toHaveBeenCalled();
  });

  it.each([
    false,
    true,
  ])('shares shutdown completion and failure (hook fails: %s)', async (fail) => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const finished = vi.fn();
    const counter = {
      key: 'counter' as const,
      blueprint: () => ({}),
      featureClasses: () => [],
      realize: () => ({ read: () => 7 }),
    };
    @Injectable()
    class Consumer {
      readonly counter = injectFeature(counter);
      constructor(lifecycle = inject(LifecycleManager)) {
        lifecycle.register({
          startup: () => {},
          shutdown: async () => {
            entered.resolve();
            await release.promise;
            finished(this.counter.read());
            if (fail) throw new Error('hook failed');
          },
        });
      }
    }
    const hooks = {
      key: 'hooks' as const,
      blueprint: () => ({}),
      featureClasses: () => [Consumer],
      realize: () => ({}),
    };
    const runtime = await createApp([counter, hooks]).createRuntime({ warmup: true });
    const consumer = await runtime.get(Consumer);
    const first = runtime.shutdown();
    await entered.promise;
    const second = runtime.shutdown();
    const outcomes = Promise.allSettled([first, second]);
    try {
      expect(second).toBe(first);
      expect(finished).not.toHaveBeenCalled();
    } finally {
      release.resolve();
      await outcomes;
    }
    expect(finished).toHaveBeenCalledExactlyOnceWith(7);
    const [one, two] = await outcomes;
    expect(one.status).toBe(fail ? 'rejected' : 'fulfilled');
    expect(two).toEqual(one);
    if (one.status === 'rejected' && two.status === 'rejected') {
      expect(two.reason).toBe(one.reason);
    }
    expect(runtime.shutdown()).toBe(first);
    expect(() => consumer.counter.read()).toThrow(/disposed/);
  });

  it('forwards writes and accessor receivers to the same runtime state', async () => {
    class State {
      count = 0;
      #value = 0;
      get value() {
        return this.#value;
      }
      set value(value: number) {
        this.#value = value;
      }
    }
    const feature = {
      key: 'state' as const,
      blueprint: () => ({}),
      featureClasses: () => [],
      realize: () => new State(),
    };
    @Injectable()
    class Consumer {
      readonly state = injectFeature(feature);
    }
    const app = createApp([feature]);
    const runtime = await app.createRuntime();
    const other = await app.createRuntime();
    try {
      const consumer = await runtime.get(Consumer);
      consumer.state.count = 9;
      expect(runtime.state.count).toBe(9);
      expect(consumer.state.count).toBe(9);
      consumer.state.value = 12;
      expect(runtime.state.value).toBe(12);
      runtime.state.count = 14;
      expect(consumer.state.count).toBe(14);
      expect(other.state.count).toBe(0);
      await runtime.shutdown();
      expect(() => {
        consumer.state.count = 20;
      }).toThrow(/disposed/);
      expect(runtime.state.count).toBe(14);
    } finally {
      await runtime.shutdown();
      await other.shutdown();
    }
  });

  it('rejects writes before realization is complete', async () => {
    const feature = {
      key: 'state' as const,
      blueprint: () => ({}),
      featureClasses: () => [],
      realize: () => ({ count: 0 }),
    };
    @Injectable()
    class Consumer {
      constructor() {
        injectFeature(feature).count = 9;
      }
    }
    const early = {
      key: 'early' as const,
      blueprint: () => ({}),
      featureClasses: () => [],
      realize: async (resolver: ServiceResolver) => ({ consumer: await resolver.get(Consumer) }),
    };
    await expect(createApp([early, feature]).createRuntime()).rejects.toThrow(/not_ready/);
  });
});
