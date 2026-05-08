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
  it('returns a fetch handler', () => {
    const app = createHttpApp({ controllers: [HelloController] });
    const handle = onCloudflareWorkers(app);

    expect(handle.fetch).toBeDefined();
    expect(typeof handle.fetch).toBe('function');
  });

  it('handles requests and returns responses', async () => {
    const app = createHttpApp({ controllers: [HelloController] });
    const handle = onCloudflareWorkers(app);
    const ctx = createMockExecutionContext();

    const res = await handle.fetch(new Request('https://example.com/hello/'), {}, ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello from workers' });
  });

  it('defaults to lazy mode (warmup: false)', async () => {
    const app = createHttpApp({ controllers: [HelloController] });
    const readySpy = vi.spyOn(app, 'ready');
    const handle = onCloudflareWorkers(app);
    const ctx = createMockExecutionContext();

    await handle.fetch(new Request('https://example.com/hello/'), {}, ctx);

    expect(readySpy).toHaveBeenCalledWith({ warmup: false });
  });

  it('respects warmup: true option', async () => {
    const app = createHttpApp({ controllers: [HelloController] });
    const readySpy = vi.spyOn(app, 'ready');
    const handle = onCloudflareWorkers(app, { warmup: true });
    const ctx = createMockExecutionContext();

    await handle.fetch(new Request('https://example.com/hello/'), {}, ctx);

    expect(readySpy).toHaveBeenCalledWith({ warmup: true });
  });

  it('calls ready() only once across multiple requests', async () => {
    const app = createHttpApp({ controllers: [HelloController] });
    const readySpy = vi.spyOn(app, 'ready');
    const handle = onCloudflareWorkers(app);
    const ctx = createMockExecutionContext();

    await handle.fetch(new Request('https://example.com/hello/'), {}, ctx);
    await handle.fetch(new Request('https://example.com/hello/'), {}, ctx);
    await handle.fetch(new Request('https://example.com/hello/'), {}, ctx);

    expect(readySpy).toHaveBeenCalledTimes(1);
  });

  it('calls waitUntil on ExecutionContext', async () => {
    const app = createHttpApp({ controllers: [HelloController] });
    const handle = onCloudflareWorkers(app);
    const ctx = createMockExecutionContext();

    await handle.fetch(new Request('https://example.com/hello/'), {}, ctx);

    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it('replaces EnvConfig with CloudflareWorkersEnvConfig when EnvConfig is registered', async () => {
    const app = createHttpApp({
      controllers: [HelloController],
      configs: [EnvConfig],
    });
    const replaceConfigSpy = vi.spyOn(app, 'replaceConfig');
    const handle = onCloudflareWorkers(app);
    const ctx = createMockExecutionContext();

    await handle.fetch(new Request('https://example.com/hello/'), {}, ctx);

    expect(replaceConfigSpy).toHaveBeenCalledWith(EnvConfig, CloudflareWorkersEnvConfig);
  });

  it('does not call replaceConfig when EnvConfig is not registered', async () => {
    const app = createHttpApp({ controllers: [HelloController] });
    const replaceConfigSpy = vi.spyOn(app, 'replaceConfig');
    const handle = onCloudflareWorkers(app);
    const ctx = createMockExecutionContext();

    await handle.fetch(new Request('https://example.com/hello/'), {}, ctx);

    expect(replaceConfigSpy).not.toHaveBeenCalled();
  });
});
