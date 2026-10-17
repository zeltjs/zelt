import { describe, expect, it, vi } from 'vitest';
import { http } from '../features/http/http.feature';
import { Controller } from '../features/http/routing/controller.decorator';
import { Get } from '../features/http/routing/http-method.decorator';
import { Injectable, inject, LifecycleManager } from '../kernel';
import { createApp } from './create-app.lib';
import type { ServiceResolver } from './feature.types';
import { injectFeature } from './inject-feature.lib';

describe('feature lifecycle regressions', () => {
  it('keeps feature handles usable and shutdown retryable when a lifecycle guard rejects', async () => {
    let blocked = true;
    const cause = new Error('shutdown blocked');
    const stopped = vi.fn();
    const callback = vi.fn();
    const counter = {
      key: 'counter' as const,
      featureClasses: () => [],
      blueprint: () => ({}),
      realize: () => ({ nested: { read: () => 7 } }),
    };
    @Injectable()
    class Consumer {
      readonly counter = injectFeature(counter);
      constructor(lifecycle = inject(LifecycleManager)) {
        lifecycle.register({
          startup: () => {},
          assertCanShutdown: () => {
            if (blocked) throw cause;
          },
          shutdown: () => {
            stopped(this.counter.nested.read());
          },
        });
      }
    }
    const runtime = await createApp([counter]).createRuntime();
    const consumer = await runtime.get(Consumer);
    const nested = consumer.counter.nested;
    runtime.registerShutdown(callback);
    try {
      await expect(runtime.shutdown()).rejects.toBe(cause);
      expect(callback).not.toHaveBeenCalled();
      expect(stopped).not.toHaveBeenCalled();
      expect(nested.read()).toBe(7);
      expect(await runtime.get(Consumer)).toBe(consumer);
    } finally {
      blocked = false;
      await runtime.shutdown();
    }
    expect(callback).toHaveBeenCalledOnce();
    expect(stopped).toHaveBeenCalledExactlyOnceWith(7);
    expect(() => nested.read()).toThrow(/disposed/);
  });

  it('guards retained nested routers and extracted fetch methods after shutdown', async () => {
    const web = http({ controllers: [] });
    @Injectable()
    class Consumer {
      readonly http = injectFeature(web);
    }
    const runtime = await createApp([web]).createRuntime();
    const consumer = await runtime.get(Consumer);
    const router = consumer.http.router;
    const fetch = router.fetch;
    try {
      expect(router).toBe(consumer.http.router);
      expect((await fetch(new Request('http://localhost/'))).status).toBe(404);
    } finally {
      await runtime.shutdown();
    }
    expect(() => router.fetch).toThrow(/disposed/);
    expect(() => fetch(new Request('http://localhost/'))).toThrow(/disposed/);
    expect(() => Object.keys(router)).toThrow(/disposed/);
  });

  it('preserves nested aliases, cycles, arrays and private receivers while guarding their lifetime', async () => {
    class State {
      #count = 0;
      self: State = this;
      get count() {
        return this.#count;
      }
      set count(value: number) {
        this.#count = value;
      }
      increment() {
        return ++this.#count;
      }
    }
    const feature = {
      key: 'nested' as const,
      featureClasses: () => [],
      blueprint: () => ({}),
      realize: () => {
        const state = new State();
        return {
          state,
          alias: state,
          list: [state],
          frozen: Object.freeze({ state }),
          date: new Date(0),
        };
      },
    };
    @Injectable()
    class Consumer {
      readonly nested = injectFeature(feature);
    }
    const runtime = await createApp([feature]).createRuntime();
    const nested = (await runtime.get(Consumer)).nested;
    const state = nested.state;
    const increment = state.increment;
    const list = nested.list;
    try {
      expect(state).toBeInstanceOf(State);
      expect(state).toBe(nested.alias);
      expect(state).toBe(state.self);
      expect(Array.isArray(list)).toBe(true);
      expect(list[0]).toBe(state);
      expect(Object.keys(list)).toEqual(['0']);
      expect(nested.frozen.state).toBe(state);
      expect(Object.getOwnPropertyDescriptor(nested.frozen, 'state')?.value).toBe(state);
      expect(nested.date.getTime()).toBe(0);
      state.count = 8;
      state.self = state;
      expect(runtime.nested.state.self).toBe(runtime.nested.state);
      expect(increment()).toBe(9);
      expect(runtime.nested.state.count).toBe(9);
    } finally {
      await runtime.shutdown();
    }
    expect(() => state.count).toThrow(/disposed/);
    expect(() => {
      state.count = 10;
    }).toThrow(/disposed/);
    expect(() => increment()).toThrow(/disposed/);
    expect(() => list[0]).toThrow(/disposed/);
  });

  it.each([
    ['request', 'initial'],
    ['fetch', 'initial'],
    ['request', 'lazy'],
    ['fetch', 'lazy'],
  ] as const)('allows HTTP %s from %s startup without reentry', async (method, phase) => {
    @Controller('')
    class HelloController {
      @Get('/')
      hello() {
        return { ok: true };
      }
    }
    const api = http({ controllers: [HelloController] });
    let starts = 0;
    const responses: Response[] = [];
    const stopped = vi.fn();
    @Injectable()
    class Consumer {
      readonly http = injectFeature(api);
      constructor(lifecycle = inject(LifecycleManager)) {
        lifecycle.register({
          startup: async () => {
            starts++;
            // Bound a regression instead of overflowing the test process.
            if (starts > 1) throw new Error('startup reentered');
            responses.push(
              await (method === 'request'
                ? this.http.request('/')
                : this.http.fetch(new Request('http://localhost/'))),
            );
          },
          shutdown: stopped,
        });
      }
    }
    const hooks = {
      key: 'hooks' as const,
      blueprint: () => ({}),
      featureClasses: () => [],
      realize: async (resolver: ServiceResolver) => {
        if (phase === 'initial') await resolver.get(Consumer);
        return {};
      },
    };
    const runtime = await createApp([api, hooks]).createRuntime({ warmup: false });
    try {
      await runtime.get(Consumer);
      expect(starts).toBe(1);
      expect(responses).toHaveLength(1);
      expect(responses[0]?.status).toBe(200);
      expect(await responses[0]?.json()).toEqual({ ok: true });
      expect((await runtime.http.request('/')).status).toBe(200);
      expect(starts).toBe(1);
    } finally {
      await runtime.shutdown();
    }
    expect(stopped).toHaveBeenCalledOnce();
  });

  it('preserves callable capabilities, receivers, properties and lifetime checks', async () => {
    const feature = {
      key: 'callable' as const,
      blueprint: () => ({}),
      featureClasses: () => [],
      realize: () =>
        Object.assign(
          function (this: unknown, value: number) {
            return { receiver: this, value: value + 1 };
          },
          { count: 0 },
        ),
    };
    @Injectable()
    class Consumer {
      readonly call = injectFeature(feature);
    }
    const app = createApp([feature]);
    const runtime = await app.createRuntime();
    const other = await app.createRuntime();
    try {
      const consumer = await runtime.get(Consumer);
      const call = consumer.call;
      const receiver = { name: 'receiver' };
      const bound = call.bind(receiver, 4);
      expect(call(1)).toEqual({ receiver: undefined, value: 2 });
      expect(consumer.call(2)).toEqual({ receiver: consumer, value: 3 });
      expect(call.call(receiver, 3)).toEqual(runtime.callable.call(receiver, 3));
      expect(call.apply(receiver, [3])).toEqual(runtime.callable.apply(receiver, [3]));
      expect(bound()).toEqual({ receiver, value: 5 });
      call.count = 9;
      expect(runtime.callable.count).toBe(9);
      expect(Object.keys(call)).toEqual(['count']);
      expect(other.callable.count).toBe(0);
      await runtime.shutdown();
      expect(() => call(1)).toThrow(/disposed/);
      expect(() => bound()).toThrow(/disposed/);
      expect((await other.get(Consumer)).call(1).value).toBe(2);
    } finally {
      await runtime.shutdown();
      await other.shutdown();
    }
  });

  it('rejects callable capabilities before realization completes', async () => {
    const feature = {
      key: 'callable' as const,
      blueprint: () => ({}),
      featureClasses: () => [],
      realize: () => () => 1,
    };
    @Injectable()
    class EarlyConsumer {
      readonly value = injectFeature(feature)();
    }
    const early = {
      key: 'early' as const,
      blueprint: () => ({}),
      featureClasses: () => [],
      realize: async (resolver: ServiceResolver) => ({
        consumer: await resolver.get(EarlyConsumer),
      }),
    };
    await expect(createApp([early, feature]).createRuntime()).rejects.toThrow(/not_ready/);
  });

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
      expect(() => runtime.lazy.resource()).toThrow(/disposed/);
      await expect(runtime.get(Resource)).rejects.toThrow(/shutdown/);
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
      expect(() => runtime.state.count).toThrow(/disposed/);
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
