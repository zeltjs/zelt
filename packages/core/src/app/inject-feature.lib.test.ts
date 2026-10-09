import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { CommandFeature, command } from '../features/command/command.feature';
import { Command } from '../features/command/definition';
import { HttpFeature, http } from '../features/http/http.feature';
import { Middleware } from '../features/http/middleware/middleware.decorator';
import type { Next } from '../features/http/middleware/middleware.types';
import { Controller } from '../features/http/routing/controller.decorator';
import { Get } from '../features/http/routing/http-method.decorator';
import { SchedulerFeature, scheduler } from '../features/scheduler/scheduler.feature';
import { Injectable, inject, LifecycleManager } from '../kernel';
import { createApp } from './create-app.lib';
import type { ServiceResolver } from './feature.types';
import { Feature } from './feature.types';
import { injectFeature } from './inject-feature.lib';

class Counter {
  #value = 0;
  increment() {
    return ++this.#value;
  }
  get value() {
    return this.#value;
  }
}

class CounterFeature<TName extends string> extends Feature<TName, Counter> {
  static readonly defaultKey = 'counter';
  constructor(readonly key: TName) {
    super();
  }
  featureClasses = () => [];
  blueprint = () => ({});
  realize = async () => new Counter();
}

describe('injectFeature contracts', () => {
  it('selects exact definitions or class/key and isolates runtimes', async () => {
    const counter = new CounterFeature('counter');
    const admin = new CounterFeature('admin');
    @Injectable()
    class Consumer {
      readonly direct = injectFeature(counter);
      readonly defaultCounter = injectFeature(CounterFeature);
      readonly admin = injectFeature(CounterFeature, 'admin');
    }
    const app = createApp([counter, admin]);
    const first = await app.createRuntime();
    const second = await app.createRuntime();
    try {
      const consumer = await first.get(Consumer);
      expectTypeOf(consumer.direct).toEqualTypeOf<Counter>();
      expect(consumer.direct).toBe(consumer.defaultCounter);
      expect(consumer.direct.increment()).toBe(1);
      expect(first.counter.value).toBe(1);
      expect(consumer.admin.increment()).toBe(1);
      expect(first.admin.value).toBe(1);
      expect((await second.get(Consumer)).direct.value).toBe(0);
      const increment = consumer.direct.increment;
      await first.shutdown();
      expect(() => increment()).toThrow(/disposed/);
      expect(() => consumer.direct.value).toThrow(/disposed/);
    } finally {
      await first.shutdown();
      await second.shutdown();
    }
  });

  it('does not substitute a named feature for an absent default', async () => {
    @Injectable()
    class Consumer {
      readonly feature = injectFeature(CounterFeature);
    }
    const runtime = await createApp([new CounterFeature('admin')]).createRuntime();
    try {
      await expect(runtime.get(Consumer)).rejects.toThrow(/counter.*not_registered/);
    } finally {
      await runtime.shutdown();
    }
  });

  it('keeps HTTP request available but explicitly rejects listen without a platform implementation', async () => {
    const runtime = await createApp([http({ controllers: [] })]).createRuntime();
    try {
      expect((await runtime.http.request('/')).status).toBe(404);
      await expect(runtime.http.listen(0)).rejects.toThrow(/HttpServerAdaptor.*listen/);
    } finally {
      await runtime.shutdown();
    }
  });

  it('fails outside a DI construction context', () => {
    expect(() => injectFeature(new CounterFeature('counter'))).toThrow();
  });

  it('rejects a different definition with an identical key', async () => {
    const other = new CounterFeature('counter');
    @Injectable()
    class Consumer {
      readonly feature = injectFeature(other);
    }
    const runtime = await createApp([new CounterFeature('counter')]).createRuntime();
    try {
      await expect(runtime.get(Consumer)).rejects.toThrow(/not_registered/);
    } finally {
      await runtime.shutdown();
    }
  });

  it('publishes all capabilities before starting consumers regardless of definition order', async () => {
    const counter = new CounterFeature('counter');
    const started = vi.fn();
    @Injectable()
    class Consumer {
      constructor(
        readonly injectedCounter = injectFeature(counter),
        lifecycle = inject(LifecycleManager),
      ) {
        lifecycle.register({
          startup: () => {
            started(this.injectedCounter.increment());
          },
          shutdown: () => {},
        });
      }
    }
    const consumerFeature = {
      key: 'consumer',
      featureClasses: () => [Consumer],
      blueprint: () => ({}),
      realize: async (resolver: ServiceResolver) => {
        const consumer = await resolver.get(Consumer);
        expect(started).not.toHaveBeenCalled();
        return { consumer };
      },
    };
    const runtime = await createApp([consumerFeature, counter]).createRuntime();
    try {
      expect(started).toHaveBeenCalledWith(1);
    } finally {
      await runtime.shutdown();
    }
  });

  it('reports early use instead of waiting on an initialization cycle and cleans up', async () => {
    const counter = new CounterFeature('counter');
    const cleanup = vi.fn();
    @Injectable()
    class Consumer {
      readonly value = injectFeature(counter).increment();
    }
    const early = {
      key: 'early',
      featureClasses: () => [],
      blueprint: () => ({}),
      realize: async (resolver: ServiceResolver) => {
        resolver.registerShutdown(cleanup);
        await resolver.get(Consumer);
        return {};
      },
    };
    await expect(createApp([early, counter]).createRuntime()).rejects.toThrow(/not_ready/);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('allows HTTP middleware to hold its own feature during realization', async () => {
    let definition: HttpFeature<'http'>;
    @Middleware
    class OwnHttp {
      private readonly http = injectFeature(definition);
      async use(next: Next): Promise<undefined> {
        expectTypeOf(this.http.listen).toBeFunction();
        expect(typeof this.http.fetch).toBe('function');
        await next();
        return undefined;
      }
    }
    @Controller('/')
    class Hello {
      @Get('/') get() {
        return 'ok';
      }
    }
    definition = http({ controllers: [Hello], middlewares: [OwnHttp] });
    const runtime = await createApp([definition]).createRuntime();
    try {
      expect((await runtime.http.request('/')).status).toBe(200);
    } finally {
      await runtime.shutdown();
    }
  });

  it('supports HTTP to command to HTTP and scheduler access through the same API', async () => {
    const ran = vi.fn();
    @Command({ name: 'refresh' })
    class Refresh {
      private readonly http = injectFeature(HttpFeature);
      async run() {
        ran(await (await this.http.request('/health')).text());
      }
    }
    @Controller('/')
    class Api {
      private readonly commands = injectFeature(CommandFeature);
      private readonly jobs = injectFeature(SchedulerFeature);
      @Get('/health') health() {
        return new Response('healthy');
      }
      @Get('/refresh') async refresh() {
        await this.jobs.startScheduler();
        const result = await this.commands.execCommand(['refresh']);
        return { code: result.exitCode, running: this.jobs.isSchedulerRunning() };
      }
    }
    const runtime = await createApp([
      command([Refresh]),
      http({ controllers: [Api] }),
      scheduler([]),
    ]).createRuntime();
    try {
      expect(runtime.schedulers.isSchedulerRunning()).toBe(false);
      const response = await runtime.http.request('/refresh');
      expect(await response.json()).toEqual({ code: 0, running: true });
      expect(ran).toHaveBeenCalledWith('healthy');
    } finally {
      await runtime.shutdown();
    }
  });
});
