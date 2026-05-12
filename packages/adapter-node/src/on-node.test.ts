import {
  CliConfig,
  Command,
  Controller,
  Cron,
  cliSchema,
  createApp,
  EnvConfig,
  Get,
  Scheduled,
} from '@zeltjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NodeCliConfig } from './cli.config';
import type { CommandNodeApp, HttpNodeApp, SchedulerNodeAppPart, ServerHandle } from './on-node';
import { onNode } from './on-node';
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
    const addFallbackConfigSpy = vi.spyOn(app, 'addFallbackConfig');

    nodeApp = await onNode(app);

    expect(addFallbackConfigSpy).toHaveBeenCalledWith(ProcessEnvConfig);
  });

  it('auto-injects NodeCliConfig when CliConfig token is in configs', async () => {
    const app = createApp({
      http: { controllers: [] },
      configs: [CliConfig],
    });
    const addFallbackConfigSpy = vi.spyOn(app, 'addFallbackConfig');

    nodeApp = await onNode(app);

    expect(addFallbackConfigSpy).toHaveBeenCalledWith(NodeCliConfig);
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

    const env = nodeApp.getConfig(EnvConfig);
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

    class TestCommand {
      static schema = cliSchema({});

      run() {
        runFn();
      }
    }
    Command({ name: 'test-cmd' })(TestCommand);

    const app = createApp({ commands: [TestCommand] });
    nodeApp = await onNode(app);

    const result = await nodeApp.execCommand(['test-cmd']);

    expect(result.exitCode).toBe(0);
    expect(runFn).toHaveBeenCalled();
  });

  it('returns exitCode 1 when command not found', async () => {
    class ExistingCommand {
      static schema = cliSchema({});

      run() {}
    }
    Command({ name: 'existing' })(ExistingCommand);

    const app = createApp({ commands: [ExistingCommand] });
    nodeApp = await onNode(app);

    const result = await nodeApp.execCommand(['nonexistent']);

    expect(result.exitCode).toBe(1);
  });

  it('returns exitCode 1 when no command specified', async () => {
    class TestCommand {
      static schema = cliSchema({});

      run() {}
    }
    Command({ name: 'test' })(TestCommand);

    const app = createApp({ commands: [TestCommand] });
    nodeApp = await onNode(app);

    const result = await nodeApp.execCommand([]);

    expect(result.exitCode).toBe(1);
  });

  it('returns exitCode 1 when command throws', async () => {
    class FailingCommand {
      static schema = cliSchema({});

      run() {
        throw new Error('Command failed');
      }
    }
    Command({ name: 'failing' })(FailingCommand);

    const app = createApp({ commands: [FailingCommand] });
    nodeApp = await onNode(app);

    const result = await nodeApp.execCommand(['failing']);

    expect(result.exitCode).toBe(1);
  });
});

describe('onNode with schedulers', () => {
  let nodeApp: (HttpNodeApp & SchedulerNodeAppPart) | undefined;

  afterEach(async () => {
    if (nodeApp) {
      await nodeApp.stopScheduler();
      await nodeApp.shutdown();
      nodeApp = undefined;
    }
  });

  it('provides startScheduler and stopScheduler methods', async () => {
    @Scheduled()
    class TestScheduler {
      @Cron('0 * * * *')
      hourlyTask() {}
    }

    @Controller('/')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp({
      http: { controllers: [TestController] },
      schedulers: [TestScheduler],
    });
    nodeApp = await onNode(app);

    expect(nodeApp.startScheduler).toBeTypeOf('function');
    expect(nodeApp.stopScheduler).toBeTypeOf('function');
  });

  it('scheduler runs after explicit startScheduler()', async () => {
    const taskFn = vi.fn();

    @Scheduled()
    class TestScheduler {
      @Cron('* * * * * *')
      everySecond() {
        taskFn();
      }
    }

    @Controller('/')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp({
      http: { controllers: [TestController] },
      schedulers: [TestScheduler],
    });
    nodeApp = await onNode(app);

    expect(taskFn).not.toHaveBeenCalled();

    await nodeApp.startScheduler();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 2000 });
  });
});
