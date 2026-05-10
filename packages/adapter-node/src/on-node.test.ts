import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, Controller, Get, EnvConfig, Command } from '@zeltjs/core';

import { onNode, type ServerHandle, type HttpNodeApp, type CommandNodeApp } from './on-node';
import { ProcessEnvConfig } from './process-env.config';

describe('onNode with HTTP', () => {
  let nodeApp: HttpNodeApp | undefined;
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

    const app = createApp({ http: { controllers: [TestController] } });
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

    const app = createApp({ http: { controllers: [PingController] } });
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

    const app = createApp({ http: { controllers: [HealthController] } });
    const readySpy = vi.spyOn(app, 'ready');

    nodeApp = await onNode(app);

    expect(readySpy).toHaveBeenCalledOnce();

    handle = await nodeApp.listen(0);
    const res = await fetch(`http://localhost:${handle.address.port}/health/`);
    const body: { status: string } = await res.json();
    expect(body.status).toBe('ok');
  });

  it('auto-injects ProcessEnvConfig when EnvConfig token is in configs', async () => {
    const app = createApp({
      http: { controllers: [] },
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

    const app = createApp({ http: { controllers: [SimpleController] } });
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

    const app = createApp({ http: { controllers: [ShutdownController] } });
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

    const app = createApp({
      http: { controllers: [ServiceController] },
      configs: [EnvConfig],
    });
    nodeApp = await onNode(app);

    const env = nodeApp.get(EnvConfig);
    expect(env.get).toBeTypeOf('function');
  });
});

describe('onNode with commands', () => {
  let nodeApp: CommandNodeApp | undefined;

  afterEach(async () => {
    await nodeApp?.shutdown();
    nodeApp = undefined;
  });

  it('executes a command and returns exitCode 0 on success', async () => {
    const runFn = vi.fn();

    @Command({ name: 'test-cmd' })
    class TestCommand {
      run() {
        runFn();
      }
    }

    const app = createApp({ commands: [TestCommand] });
    nodeApp = await onNode(app);

    const result = await nodeApp.exec(['test-cmd']);

    expect(result.exitCode).toBe(0);
    expect(runFn).toHaveBeenCalled();
  });

  it('returns exitCode 1 when command not found', async () => {
    @Command({ name: 'existing' })
    class ExistingCommand {
      run() {}
    }

    const app = createApp({ commands: [ExistingCommand] });
    nodeApp = await onNode(app);

    const result = await nodeApp.exec(['nonexistent']);

    expect(result.exitCode).toBe(1);
  });

  it('returns exitCode 1 when no command specified', async () => {
    @Command({ name: 'test' })
    class TestCommand {
      run() {}
    }

    const app = createApp({ commands: [TestCommand] });
    nodeApp = await onNode(app);

    const result = await nodeApp.exec([]);

    expect(result.exitCode).toBe(1);
  });

  it('returns exitCode 1 when command throws', async () => {
    @Command({ name: 'failing' })
    class FailingCommand {
      run() {
        throw new Error('Command failed');
      }
    }

    const app = createApp({ commands: [FailingCommand] });
    nodeApp = await onNode(app);

    const result = await nodeApp.exec(['failing']);

    expect(result.exitCode).toBe(1);
  });
});
