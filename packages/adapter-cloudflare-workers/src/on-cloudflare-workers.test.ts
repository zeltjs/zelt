import type { ZeltPrebuilt } from '@zeltjs/core';
import {
  Config,
  Controller,
  createApp,
  EnvAdaptor,
  Get,
  HttpFeature,
  http,
  Injectable,
  inject,
  injectFeature,
  request,
  TaskService,
} from '@zeltjs/core';
import { beforeEach, describe, expect, expectTypeOf, it, onTestFinished, vi } from 'vitest';
import { CloudflareWorkersEnvAdaptor } from './cloudflare-workers-env.adaptor';
import { CloudflareWorkersWaitUntilAdaptor } from './cloudflare-workers-wait-until.adaptor';
import { CloudflareBindings, onCloudflareWorkers } from './index';
import { env, pendingTasks } from './test-fixtures/cloudflare-workers';

declare global {
  namespace Cloudflare {
    interface Env {
      LABEL: string;
    }
  }
}

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'hello from workers' };
  }
}

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  pendingTasks.length = 0;
});

describe('onCloudflareWorkers', () => {
  it('initializes without HTTP and adds no adapter capabilities', async () => {
    const workers = await onCloudflareWorkers(createApp([]));
    onTestFinished(() => workers.shutdown());
    expectTypeOf(workers).not.toHaveProperty('http');
    expectTypeOf(workers).not.toHaveProperty('fetch');
    expect(workers).not.toHaveProperty('fetch');
  });

  it('publishes the original HTTP capability and serves directly through its fetch', async () => {
    const web = http({ controllers: [HelloController] });
    @Injectable()
    class Consumer {
      readonly http = injectFeature(web);
    }
    const workers = await onCloudflareWorkers(createApp([web]));
    onTestFinished(() => workers.shutdown());
    expectTypeOf(workers).not.toHaveProperty('fetch');
    expect(workers).not.toHaveProperty('fetch');
    expect((await workers.get(Consumer)).http).toBe(workers.http);
    expect(workers.getFeatureEntries(HttpFeature)[0]?.capabilities).toBe(workers.http);
    const exported = { fetch: workers.http.fetch };
    const res = await exported.fetch(new Request('https://example.com/hello/'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello from workers' });
    await workers.shutdown();
    expect(() => exported.fetch(new Request('https://example.com/hello/'))).toThrow(/disposed/);
  });

  it('preserves a feature named fetch and supports multiple named HTTP features', async () => {
    const workers = await onCloudflareWorkers(
      createApp([
        http({ name: 'fetch', controllers: [HelloController] }),
        http({ name: 'public', controllers: [HelloController] }),
      ]),
    );
    onTestFinished(() => workers.shutdown());
    expectTypeOf(workers).not.toHaveProperty('http');
    const exported = { fetch: workers.public.fetch };
    expect((await exported.fetch(new Request('https://example.com/hello/'))).status).toBe(200);
    expect((await workers.fetch.request('/hello/')).status).toBe(200);
  });

  it.each([
    false,
    true,
  ])('passes warmup=%s and environment defaults to createRuntime', async (warmup) => {
    const app = createApp([]);
    const createRuntime = vi.spyOn(app, 'createRuntime');
    const workers = await onCloudflareWorkers(app, { warmup });
    onTestFinished(() => workers.shutdown());
    expect(createRuntime).toHaveBeenCalledExactlyOnceWith({
      fallbackConfigs: [CloudflareWorkersEnvAdaptor, CloudflareWorkersWaitUntilAdaptor],
      warmup,
    });
  });

  it('passes prebuilt and config overrides while defaulting to lazy initialization', async () => {
    @Config
    class TestEnvAdaptor extends EnvAdaptor {
      override get(key: string): string | undefined {
        return key === 'CF_ENV' ? 'test-override' : undefined;
      }
    }
    const app = createApp([]);
    const createRuntime = vi.spyOn(app, 'createRuntime');
    const prebuilt: ZeltPrebuilt = { version: 1, features: {} };
    const workers = await onCloudflareWorkers(app, { configs: [TestEnvAdaptor], prebuilt });
    onTestFinished(() => workers.shutdown());
    expect(createRuntime).toHaveBeenCalledExactlyOnceWith({
      configs: [TestEnvAdaptor],
      prebuilt,
      fallbackConfigs: [CloudflareWorkersEnvAdaptor, CloudflareWorkersWaitUntilAdaptor],
      warmup: false,
    });
    expect((await workers.get(EnvAdaptor)).get('CF_ENV')).toBe('test-override');
  });

  it('reads native bindings during concurrent direct HTTP requests in synchronous context mode', async () => {
    env['LABEL'] = 'native-binding';
    @Controller('/')
    class BindingsController {
      constructor(private readonly bindings = inject(CloudflareBindings)) {}
      @Get('/')
      async handle(req = request(), label = this.bindings.get('LABEL')) {
        await Promise.resolve();
        return { label, id: req.queryParam('id') };
      }
    }
    const workers = await onCloudflareWorkers(
      createApp([http({ controllers: [BindingsController] })]),
      { contextMode: 'sync' },
    );
    onTestFinished(() => workers.shutdown());
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, id) =>
        workers.http.fetch(new Request(`https://example.com/?id=${id}`)),
      ),
    );
    for (const [id, res] of responses.entries()) {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ label: 'native-binding', id: String(id) });
    }
  });

  it('keeps after-response work registered with native waitUntil until the task completes', async () => {
    const events: string[] = [];
    const gate = Promise.withResolvers<void>();
    onTestFinished(() => gate.resolve());
    @Controller('/')
    class AfterResponseController {
      constructor(private readonly tasks = inject(TaskService)) {}
      @Get('/')
      trigger() {
        this.tasks.afterResponse(async () => {
          events.push('task-started');
          await gate.promise;
          events.push('task-finished');
        });
        return { triggered: true };
      }
    }
    const workers = await onCloudflareWorkers(
      createApp([http({ controllers: [AfterResponseController] })]),
    );
    onTestFinished(() => workers.shutdown());
    const res = await workers.http.fetch(new Request('https://example.com/'));
    expect(res.status).toBe(200);
    expect(events).toEqual([]);
    await vi.waitFor(() => expect(events).toEqual(['task-started']));
    expect(pendingTasks.length).toBeGreaterThan(0);
    let settled = false;
    const completion = Promise.all(pendingTasks).then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    gate.resolve();
    await completion;
    expect(events).toEqual(['task-started', 'task-finished']);
    expect(settled).toBe(true);
  });
});
