import { describe, expect, it, vi } from 'vitest';
import { Controller, Get, createHttpApp, EnvConfig } from '@zeltjs/core';

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
    const app = createHttpApp({ controllers: [HelloController] });
    const workersApp = await onCloudflareWorkers(app);

    expect(workersApp.fetch).toBeDefined();
    expect(typeof workersApp.fetch).toBe('function');
    expect(workersApp.get).toBeDefined();
    expect(typeof workersApp.get).toBe('function');
  });

  it('handles requests and returns responses', async () => {
    const app = createHttpApp({ controllers: [HelloController] });
    const workersApp = await onCloudflareWorkers(app);
    const ctx = createMockExecutionContext();

    const res = await workersApp.fetch(new Request('https://example.com/hello/'), {}, ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello from workers' });
  });

  it('defaults to lazy mode (warmup: false)', async () => {
    const app = createHttpApp({ controllers: [HelloController] });
    const readySpy = vi.spyOn(app, 'ready');

    await onCloudflareWorkers(app);

    expect(readySpy).toHaveBeenCalledWith({ warmup: false });
  });

  it('respects warmup: true option', async () => {
    const app = createHttpApp({ controllers: [HelloController] });
    const readySpy = vi.spyOn(app, 'ready');

    await onCloudflareWorkers(app, { warmup: true });

    expect(readySpy).toHaveBeenCalledWith({ warmup: true });
  });

  it('ready() is called once during onCloudflareWorkers', async () => {
    const app = createHttpApp({ controllers: [HelloController] });
    const readySpy = vi.spyOn(app, 'ready');
    const ctx = createMockExecutionContext();

    const workersApp = await onCloudflareWorkers(app);
    await workersApp.fetch(new Request('https://example.com/hello/'), {}, ctx);
    await workersApp.fetch(new Request('https://example.com/hello/'), {}, ctx);
    await workersApp.fetch(new Request('https://example.com/hello/'), {}, ctx);

    expect(readySpy).toHaveBeenCalledTimes(1);
  });

  it('calls waitUntil on ExecutionContext', async () => {
    const app = createHttpApp({ controllers: [HelloController] });
    const workersApp = await onCloudflareWorkers(app);
    const ctx = createMockExecutionContext();

    await workersApp.fetch(new Request('https://example.com/hello/'), {}, ctx);

    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it('replaces EnvConfig with CloudflareWorkersEnvConfig when EnvConfig is registered', async () => {
    const app = createHttpApp({
      controllers: [HelloController],
      configs: [EnvConfig],
    });
    const replaceConfigSpy = vi.spyOn(app, 'replaceConfig');

    await onCloudflareWorkers(app);

    expect(replaceConfigSpy).toHaveBeenCalledWith(EnvConfig, CloudflareWorkersEnvConfig);
  });

  it('does not call replaceConfig when EnvConfig is not registered', async () => {
    const app = createHttpApp({ controllers: [HelloController] });
    const replaceConfigSpy = vi.spyOn(app, 'replaceConfig');

    await onCloudflareWorkers(app);

    expect(replaceConfigSpy).not.toHaveBeenCalled();
  });

  it('provides get() to retrieve dependencies from container', async () => {
    const app = createHttpApp({
      controllers: [HelloController],
      configs: [EnvConfig],
    });
    const workersApp = await onCloudflareWorkers(app);

    const env = workersApp.get(EnvConfig);
    expect(env.get).toBeTypeOf('function');
  });
});
