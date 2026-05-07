import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpApp, Controller, Get, EnvConfig, ProcessEnvConfig } from '@zeltjs/core';

import { onNode, type ServerHandle } from './on-node';

describe('onNode', () => {
  let handle: ServerHandle | undefined;

  afterEach(async () => {
    await handle?.shutdown();
    handle = undefined;
  });

  it('calls ready and returns server handle', async () => {
    @Controller('/')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createHttpApp({ controllers: [TestController] });
    handle = await onNode(app).listen(0);

    expect(handle.address.port).toBeGreaterThan(0);
    expect(handle.shutdown).toBeTypeOf('function');

    const res = await fetch(`http://localhost:${handle.address.port}/`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const body: { ok: boolean } = await res.json();
    expect(body.ok).toBe(true);
  });

  it('accepts numeric port shorthand', async () => {
    @Controller('/')
    class PingController {
      @Get('/')
      ping() {
        return { pong: true };
      }
    }

    const app = createHttpApp({ controllers: [PingController] });
    handle = await onNode(app).listen(0);

    expect(handle.address.port).toBeGreaterThan(0);
    const res = await fetch(`http://localhost:${handle.address.port}/`);
    expect(res.status).toBe(200);
  });

  it('calls app.ready() before serving', async () => {
    @Controller('/health')
    class HealthController {
      @Get('/')
      check() {
        return { status: 'ok' };
      }
    }

    const app = createHttpApp({ controllers: [HealthController] });
    const readySpy = vi.spyOn(app, 'ready');

    handle = await onNode(app).listen(0);

    expect(readySpy).toHaveBeenCalledOnce();

    const res = await fetch(`http://localhost:${handle.address.port}/health/`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const body: { status: string } = await res.json();
    expect(body.status).toBe('ok');
  });

  it('auto-injects ProcessEnvConfig when EnvConfig token is in configs', async () => {
    const app = createHttpApp({
      controllers: [],
      configs: [EnvConfig],
    });
    const replaceConfigSpy = vi.spyOn(app, 'replaceConfig');

    handle = await onNode(app).listen(0);

    expect(replaceConfigSpy).toHaveBeenCalledWith(EnvConfig, ProcessEnvConfig);
  });

  it('silently skips ProcessEnvConfig injection when EnvConfig is not in configs', async () => {
    @Controller('/')
    class SimpleController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createHttpApp({ controllers: [SimpleController] });
    handle = await onNode(app).listen(0);

    const res = await fetch(`http://localhost:${handle.address.port}/`);
    expect(res.status).toBe(200);
  });

  it('shutdown stops the server', async () => {
    @Controller('/')
    class ShutdownController {
      @Get('/')
      get() {
        return {};
      }
    }

    const app = createHttpApp({ controllers: [ShutdownController] });
    handle = await onNode(app).listen(0);
    const { port } = handle.address;

    await handle.shutdown();
    handle = undefined;

    await expect(fetch(`http://localhost:${port}/`)).rejects.toThrow();
  });
});
