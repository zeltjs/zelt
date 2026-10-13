import { describe, expect, it } from 'vitest';
import { Config } from '../built-in-service';
import { Injectable, inject, LifecycleManager } from '../kernel';
import { createApp } from './create-app.lib';
import type { ServiceResolver } from './feature.types';
import { injectFeature } from './inject-feature.lib';

describe('feature initialization boundaries', () => {
  it.each([
    false,
    true,
  ])('starts resources registered as a shared batch completes (fails: %s)', async (fail) => {
    const events: string[] = [];
    const cause = new Error('B startup failed');
    @Injectable()
    class A {
      readonly ready = inject(LifecycleManager).register({
        startup: () => {
          events.push('A:start');
          return { value: 'A' };
        },
        shutdown: () => {
          events.push('A:stop');
        },
      });
    }
    @Injectable()
    class B {
      readonly ready = inject(LifecycleManager).register({
        startup: () => {
          events.push('B:start');
          if (fail) throw cause;
          return { value: 'B' };
        },
        shutdown: () => {
          events.push('B:stop');
        },
      });
    }
    const runtime = await createApp([]).createRuntime();
    try {
      const first = runtime.get(A);
      const second = Promise.resolve().then(() => runtime.get(B));
      const [one, two] = await Promise.allSettled([first, second]);
      if (fail) {
        expect(two).toMatchObject({ status: 'rejected', reason: { cause } });
        expect(events).toEqual(['A:start', 'B:start', 'A:stop']);
      } else {
        expect(one.status).toBe('fulfilled');
        expect(two.status).toBe('fulfilled');
        if (one.status === 'fulfilled') expect(one.value.ready.value).toBe('A');
        if (two.status === 'fulfilled') expect(two.value.ready.value).toBe('B');
        expect(events).toEqual(['A:start', 'B:start']);
      }
    } finally {
      await runtime.shutdown();
    }
    expect(events).toEqual(
      fail ? ['A:start', 'B:start', 'A:stop'] : ['A:start', 'B:start', 'B:stop', 'A:stop'],
    );
  });

  it.each([
    'app',
    'runtime',
  ] as const)('prepares %s configs before constructing feature consumers', async (scope) => {
    const events: string[] = [];
    @Config
    class ConnectionConfig {
      url = '';
      constructor(lifecycle = inject(LifecycleManager)) {
        lifecycle.register({
          startup: async () => {
            await Promise.resolve();
            this.url = 'redis://localhost:16379';
            events.push('config:start');
          },
          shutdown: () => {
            events.push('config:stop');
          },
        });
      }
    }
    const target = {
      key: 'target' as const,
      featureClasses: () => [],
      blueprint: () => ({}),
      realize: () => ({ read: () => 'feature ready' }),
    };
    @Injectable()
    class Consumer {
      readonly url = inject(ConnectionConfig).url;
      readonly target = injectFeature(target);
      constructor(lifecycle = inject(LifecycleManager)) {
        events.push(`consumer:construct:${this.url}`);
        lifecycle.register({
          startup: () => {
            events.push(this.target.read());
          },
          shutdown: () => {
            events.push('consumer:stop');
          },
        });
      }
    }
    const consumer = {
      key: 'consumer' as const,
      featureClasses: () => [],
      blueprint: () => ({}),
      realize: async (resolver: ServiceResolver) => ({ instance: await resolver.get(Consumer) }),
    };
    const configs = [ConnectionConfig];
    const app = createApp([consumer, target], scope === 'app' ? { configs } : undefined);
    const runtime = await app.createRuntime(scope === 'runtime' ? { configs } : undefined);
    try {
      expect(runtime.consumer.instance.url).toBe('redis://localhost:16379');
      expect(events).toEqual([
        'config:start',
        'consumer:construct:redis://localhost:16379',
        'feature ready',
      ]);
    } finally {
      await runtime.shutdown();
    }
    expect(events.slice(-2)).toEqual(['consumer:stop', 'config:stop']);
  });

  it.each([
    'config',
    'realize',
  ] as const)('cleans up configured resources when %s fails', async (phase) => {
    const events: string[] = [];
    @Config
    class FirstConfig {
      constructor(lifecycle = inject(LifecycleManager)) {
        lifecycle.register({
          startup: () => {
            events.push('first:start');
          },
          shutdown: () => {
            events.push('first:stop');
          },
        });
      }
    }
    @Config
    class SecondConfig {
      constructor(lifecycle = inject(LifecycleManager)) {
        lifecycle.register({
          startup: () => {
            events.push('second:start');
            if (phase === 'config') throw new Error('config failed');
          },
          shutdown: () => {
            events.push('second:stop');
          },
        });
      }
    }
    const broken = {
      key: 'broken' as const,
      featureClasses: () => [],
      blueprint: () => ({}),
      realize: () => {
        events.push('realize');
        throw new Error('realize failed');
      },
    };
    await expect(
      createApp([broken], { configs: [FirstConfig, SecondConfig] }).createRuntime(),
    ).rejects.toThrow();
    expect(events).toEqual(
      phase === 'config'
        ? ['first:start', 'second:start', 'first:stop']
        : ['first:start', 'second:start', 'realize', 'second:stop', 'first:stop'],
    );
  });
});
