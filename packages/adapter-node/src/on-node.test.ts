import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpApp, Controller, Get, EnvConfig } from '@zeltjs/core';

import { onNode, type ServerHandle, type NodeApp } from './on-node';
import { ProcessEnvConfig } from './process-env.config';

describe('onNode', () => {
  let nodeApp: NodeApp | undefined;
  let handle: ServerHandle | undefined;

  afterEach(async () => {
    await handle?.shutdown();
    handle = undefined;
    nodeApp = undefined;
  });

  it('calls ready and returns NodeApp with get and listen', async () => {
    @Controller('/')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createHttpApp({ controllers: [TestController] });
    nodeApp = await onNode(app);
    handle = await nodeApp.listen(0);

    expect(handle.address.port).toBeGreaterThan(0);
    expect(handle.shutdown).toBeTypeOf('function');

    const res = await fetch(`http://localhost:${handle.address.port}/`);
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
    nodeApp = await onNode(app);
    handle = await nodeApp.listen(0);

    expect(handle.address.port).toBeGreaterThan(0);
    const res = await fetch(`http://localhost:${handle.address.port}/`);
    expect(res.status).toBe(200);
  });

  it('calls app.ready() during onNode', async () => {
    @Controller('/health')
    class HealthController {
      @Get('/')
      check() {
        return { status: 'ok' };
      }
    }

    const app = createHttpApp({ controllers: [HealthController] });
    const readySpy = vi.spyOn(app, 'ready');

    nodeApp = await onNode(app);

    expect(readySpy).toHaveBeenCalledOnce();

    handle = await nodeApp.listen(0);
    const res = await fetch(`http://localhost:${handle.address.port}/health/`);
    const body: { status: string } = await res.json();
    expect(body.status).toBe('ok');
  });

  it('auto-injects ProcessEnvConfig when EnvConfig token is in configs', async () => {
    const app = createHttpApp({
      controllers: [],
      configs: [EnvConfig],
    });
    const replaceConfigSpy = vi.spyOn(app, 'replaceConfig');

    nodeApp = await onNode(app);

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
    nodeApp = await onNode(app);
    handle = await nodeApp.listen(0);

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
    nodeApp = await onNode(app);
    handle = await nodeApp.listen(0);
    const { port } = handle.address;

    await handle.shutdown();
    handle = undefined;

    await expect(fetch(`http://localhost:${port}/`)).rejects.toThrow();
  });

  it('provides get() to retrieve dependencies from container', async () => {
    @Controller('/')
    class ServiceController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createHttpApp({
      controllers: [ServiceController],
      configs: [EnvConfig],
    });
    nodeApp = await onNode(app);

    const env = nodeApp.get(EnvConfig);
    expect(env.get).toBeTypeOf('function');
  });
});
