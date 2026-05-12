import { Controller, createApp, EnvConfig, Get } from '@zeltjs/core';
import { describe, expect, it, vi } from 'vitest';

import { CloudflareWorkersEnvConfig } from './cloudflare-workers-env.config';
import { onCloudflareWorkers } from './on-cloudflare-workers';

@Controller('/hello')
class HelloController {
  @Get('/')
  greet() {
    return { message: 'hello from workers' };
  }
}

const createMockExecutionContext = () =>
  ({
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {},
  }) as unknown as ExecutionContext;

describe('onCloudflareWorkers', () => {
  it('returns CloudflareWorkersApp with get and fetch', async () => {
    const app = createApp({ http: { controllers: [HelloController] } });
    const workersApp = await onCloudflareWorkers(app);

    expect(workersApp.fetch).toBeDefined();
    expect(typeof workersApp.fetch).toBe('function');
    expect(workersApp.get).toBeDefined();
    expect(typeof workersApp.get).toBe('function');
  });

  it('handles requests and returns responses', async () => {
    const app = createApp({ http: { controllers: [HelloController] } });
    const workersApp = await onCloudflareWorkers(app);
    const ctx = createMockExecutionContext();

    const res = await workersApp.fetch(new Request('https://example.com/hello/'), {}, ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello from workers' });
  });

  it('defaults to lazy mode (warmup: false)', async () => {
    const app = createApp({ http: { controllers: [HelloController] } });
    const readySpy = vi.spyOn(app, 'ready');

    await onCloudflareWorkers(app);

    expect(readySpy).toHaveBeenCalledWith({ warmup: false });
  });

  it('respects warmup: true option', async () => {
    const app = createApp({ http: { controllers: [HelloController] } });
    const readySpy = vi.spyOn(app, 'ready');

    await onCloudflareWorkers(app, { warmup: true });

    expect(readySpy).toHaveBeenCalledWith({ warmup: true });
  });

  it('ready() is called once during onCloudflareWorkers', async () => {
    const app = createApp({ http: { controllers: [HelloController] } });
    const readySpy = vi.spyOn(app, 'ready');
    const ctx = createMockExecutionContext();

    const workersApp = await onCloudflareWorkers(app);
    await workersApp.fetch(new Request('https://example.com/hello/'), {}, ctx);
    await workersApp.fetch(new Request('https://example.com/hello/'), {}, ctx);
    await workersApp.fetch(new Request('https://example.com/hello/'), {}, ctx);

    expect(readySpy).toHaveBeenCalledTimes(1);
  });

  it('calls waitUntil on ExecutionContext', async () => {
    const app = createApp({ http: { controllers: [HelloController] } });
    const workersApp = await onCloudflareWorkers(app);
    const ctx = createMockExecutionContext();

    await workersApp.fetch(new Request('https://example.com/hello/'), {}, ctx);

    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it('adds CloudflareWorkersEnvConfig as fallback', async () => {
    const app = createApp({
      http: { controllers: [HelloController] },
      configs: [EnvConfig],
    });
    const addFallbackConfigSpy = vi.spyOn(app, 'addFallbackConfig');

    await onCloudflareWorkers(app);

    expect(addFallbackConfigSpy).toHaveBeenCalledWith(CloudflareWorkersEnvConfig);
  });

  it('provides get() to retrieve dependencies from container', async () => {
    const app = createApp({
      http: { controllers: [HelloController] },
      configs: [EnvConfig],
    });
    const workersApp = await onCloudflareWorkers(app);

    const env = workersApp.getConfig(EnvConfig);
    expect(env.get).toBeTypeOf('function');
  });
});

describe('dynamic mode', () => {
  it('returns __dynamicMeta when dynamic: true', async () => {
    const app = createApp({ http: { controllers: [HelloController] } });
    const workersApp = await onCloudflareWorkers(app, { dynamic: true });

    expect(workersApp.__dynamicMeta).toBeDefined();
    expect(workersApp.__dynamicMeta?.controllers).toHaveLength(1);
    expect(workersApp.__dynamicMeta?.controllers[0]).toMatchObject({
      basePath: '/hello',
      name: 'HelloController',
    });
    expect(workersApp.__dynamicMeta?.controllers[0].sourceFile).toContain('.test.ts');
  });

  it('does not include __dynamicMeta when dynamic: false (default)', async () => {
    const app = createApp({ http: { controllers: [HelloController] } });
    const workersApp = await onCloudflareWorkers(app);

    expect(workersApp.__dynamicMeta).toBeUndefined();
  });
});
