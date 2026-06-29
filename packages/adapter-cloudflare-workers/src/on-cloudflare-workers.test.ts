import { Config, Controller, createApp, EnvAdaptor, Get, http, inject } from '@zeltjs/core';
import { describe, expect, it, vi } from 'vitest';
import { CloudflareWorkersEnvAdaptor } from './cloudflare-workers-env.adaptor';
import { CloudflareBindings } from './index';
import { onCloudflareWorkers } from './on-cloudflare-workers';

declare global {
  interface Env {
    DB: D1Database;
    CACHE: KVNamespace;
  }
}

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'hello from workers' };
  }
}

@Controller('/bindings')
class BindingsController {
  constructor(private readonly bindings = inject(CloudflareBindings)) {}

  @Get('/db')
  db() {
    return { same: this.bindings.get('DB') === mockD1 };
  }
}

const mockD1 = {
  prepare: vi.fn(),
} as unknown as D1Database;

const mockCache = {
  get: vi.fn(),
} as unknown as KVNamespace;

const createMockEnv = (): Env => ({ DB: mockD1, CACHE: mockCache });

const createMockExecutionContext = () =>
  ({
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {},
  }) as unknown as ExecutionContext;

describe('onCloudflareWorkers', () => {
  it('returns CloudflareWorkersApp with get and fetch', async () => {
    const app = createApp([http({ controllers: [HelloController] })]);
    const workersApp = await onCloudflareWorkers(app);

    expect(workersApp.fetch).toBeDefined();
    expect(typeof workersApp.fetch).toBe('function');
    expect(workersApp.get).toBeDefined();
    expect(typeof workersApp.get).toBe('function');
  });

  it('handles requests and returns responses', async () => {
    const app = createApp([http({ controllers: [HelloController] })]);
    const workersApp = await onCloudflareWorkers(app);
    const ctx = createMockExecutionContext();

    const res = await workersApp.fetch(
      new Request('https://example.com/hello/'),
      createMockEnv(),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello from workers' });
  });

  it('defaults to lazy mode (warmup: false)', async () => {
    const app = createApp([http({ controllers: [HelloController] })]);
    const readySpy = vi.spyOn(app, 'createRuntime');

    await onCloudflareWorkers(app);

    expect(readySpy).toHaveBeenCalledWith({
      fallbackConfigs: [CloudflareWorkersEnvAdaptor],
      warmup: false,
    });
  });

  it('respects warmup: true option', async () => {
    const app = createApp([http({ controllers: [HelloController] })]);
    const readySpy = vi.spyOn(app, 'createRuntime');

    await onCloudflareWorkers(app, { warmup: true });

    expect(readySpy).toHaveBeenCalledWith({
      fallbackConfigs: [CloudflareWorkersEnvAdaptor],
      warmup: true,
    });
  });

  it('createRuntime() is called once during onCloudflareWorkers', async () => {
    const app = createApp([http({ controllers: [HelloController] })]);
    const readySpy = vi.spyOn(app, 'createRuntime');
    const ctx = createMockExecutionContext();

    const workersApp = await onCloudflareWorkers(app);
    await workersApp.fetch(new Request('https://example.com/hello/'), createMockEnv(), ctx);
    await workersApp.fetch(new Request('https://example.com/hello/'), createMockEnv(), ctx);
    await workersApp.fetch(new Request('https://example.com/hello/'), createMockEnv(), ctx);

    expect(readySpy).toHaveBeenCalledTimes(1);
  });

  it('calls waitUntil on ExecutionContext', async () => {
    const app = createApp([http({ controllers: [HelloController] })]);
    const workersApp = await onCloudflareWorkers(app);
    const ctx = createMockExecutionContext();

    await workersApp.fetch(new Request('https://example.com/hello/'), createMockEnv(), ctx);

    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it('passes fallback configs to createRuntime()', async () => {
    const app = createApp([http({ controllers: [HelloController] })], {
      configs: [EnvAdaptor],
    });
    const readySpy = vi.spyOn(app, 'createRuntime');

    await onCloudflareWorkers(app);

    expect(readySpy).toHaveBeenCalledWith({
      fallbackConfigs: [CloudflareWorkersEnvAdaptor],
      warmup: false,
    });
  });

  it('passes config overrides to createRuntime()', async () => {
    @Config
    class TestEnvAdaptor extends EnvAdaptor {
      override get(key: string): string | undefined {
        return key === 'CF_ENV' ? 'test-override' : undefined;
      }
    }

    const app = createApp([http({ controllers: [HelloController] })]);
    const readySpy = vi.spyOn(app, 'createRuntime');

    const workersApp = await onCloudflareWorkers(app, { configs: [TestEnvAdaptor] });

    expect(readySpy).toHaveBeenCalledWith({
      configs: [TestEnvAdaptor],
      fallbackConfigs: [CloudflareWorkersEnvAdaptor],
      warmup: false,
    });
    const env = await workersApp.get(EnvAdaptor);
    expect(env.get('CF_ENV')).toBe('test-override');
  });

  it('provides get() to retrieve dependencies from container', async () => {
    const app = createApp([http({ controllers: [HelloController] })], {
      configs: [EnvAdaptor],
    });
    const workersApp = await onCloudflareWorkers(app);

    const env = await workersApp.get(EnvAdaptor);
    expect(env.get).toBeTypeOf('function');
  });

  it('provides Cloudflare bindings through DI during request handling', async () => {
    const app = createApp([http({ controllers: [BindingsController] })]);
    const workersApp = await onCloudflareWorkers(app);
    const ctx = createMockExecutionContext();

    const res = await workersApp.fetch(
      new Request('https://example.com/bindings/db'),
      createMockEnv(),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ same: true });
  });
});
