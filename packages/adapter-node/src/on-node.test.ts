import {
  args,
  Command,
  Controller,
  Cron,
  cliSchema,
  command,
  createApp,
  EnvAdaptor,
  Get,
  http,
  Scheduled,
  scheduler,
} from '@zeltjs/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const originalMaxListeners = process.getMaxListeners();

beforeAll(() => {
  process.setMaxListeners(50);
});

afterAll(() => {
  process.setMaxListeners(originalMaxListeners);
});

import { NodeCliConfig } from './node-cli.config';
import type {
  CommandNodeApp,
  HttpNodeApp,
  NodeApp,
  SchedulerNodeAppPart,
  ServerHandle,
} from './on-node';
import { onNode } from './on-node';
import { ProcessEnvAdaptor } from './process-env.adaptor';

const isHttpNodeApp = (app: NodeApp): app is HttpNodeApp => 'listen' in app;
const isCommandNodeApp = (app: NodeApp): app is CommandNodeApp => 'execCommand' in app;
const hasScheduler = (app: NodeApp): app is NodeApp & SchedulerNodeAppPart =>
  'startScheduler' in app;

describe('onNode with HTTP', () => {
  let nodeApp: NodeApp | undefined;
  let handle: ServerHandle | undefined;

  afterEach(async () => {
    await handle?.shutdown();
    if (!handle) await nodeApp?.shutdown();
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

    const app = createApp([http({ controllers: [TestController] })]);
    nodeApp = await onNode(app);

    expect(isHttpNodeApp(nodeApp)).toBe(true);
    if (!isHttpNodeApp(nodeApp)) throw new Error('expected listen');
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

    const app = createApp([http({ controllers: [PingController] })]);
    nodeApp = await onNode(app);

    if (!isHttpNodeApp(nodeApp)) throw new Error('expected listen');
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

    const app = createApp([http({ controllers: [HealthController] })]);
    const readySpy = vi.spyOn(app, 'ready');

    nodeApp = await onNode(app);

    expect(readySpy).toHaveBeenCalledOnce();

    if (!isHttpNodeApp(nodeApp)) throw new Error('expected listen');
    handle = await nodeApp.listen(0);
    const res = await fetch(`http://localhost:${handle.address.port}/health/`);
    const body: { status: string } = await res.json();
    expect(body.status).toBe('ok');
  });

  it('passes fallback configs to ready()', async () => {
    const app = createApp([http({ controllers: [] })], { configs: [EnvAdaptor] });
    const readySpy = vi.spyOn(app, 'ready');

    nodeApp = await onNode(app);

    expect(readySpy).toHaveBeenCalledWith({
      fallbackConfigs: [NodeCliConfig, ProcessEnvAdaptor],
      warmup: true,
    });
  });

  it('works without explicit EnvAdaptor in configs', async () => {
    @Controller('/')
    class SimpleController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [SimpleController] })]);
    nodeApp = await onNode(app);

    if (!isHttpNodeApp(nodeApp)) throw new Error('expected listen');
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

    const app = createApp([http({ controllers: [ShutdownController] })]);
    nodeApp = await onNode(app);

    if (!isHttpNodeApp(nodeApp)) throw new Error('expected listen');
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

    const app = createApp([http({ controllers: [ServiceController] })], {
      configs: [EnvAdaptor],
    });
    nodeApp = await onNode(app);

    const env = await nodeApp.get(EnvAdaptor);
    expect(env.get).toBeTypeOf('function');
  });
});

describe('onNode with commands', () => {
  let nodeApp: NodeApp | undefined;

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

    const app = createApp([command([TestCommand])]);
    nodeApp = await onNode(app);

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected execCommand');
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

    const app = createApp([command([ExistingCommand])]);
    nodeApp = await onNode(app);

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected execCommand');
    const result = await nodeApp.execCommand(['nonexistent']);

    expect(result.exitCode).toBe(1);
  });

  it('returns exitCode 1 when no command specified', async () => {
    class TestCommand {
      static schema = cliSchema({});

      run() {}
    }
    Command({ name: 'test' })(TestCommand);

    const app = createApp([command([TestCommand])]);
    nodeApp = await onNode(app);

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected execCommand');
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

    const app = createApp([command([FailingCommand])]);
    nodeApp = await onNode(app);

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected execCommand');
    const result = await nodeApp.execCommand(['failing']);

    expect(result.exitCode).toBe(1);
  });

  it('args() returns parsed arguments within command', async () => {
    let capturedName: string | undefined;

    class GreetCommand {
      static schema = cliSchema({
        args: [{ name: 'name', type: 'string' }],
      });

      run() {
        const parsed = args(GreetCommand);
        capturedName = parsed.name;
      }
    }
    Command({ name: 'greet' })(GreetCommand);

    const app = createApp([command([GreetCommand])]);
    nodeApp = await onNode(app);

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected execCommand');
    const result = await nodeApp.execCommand(['greet', 'Alice']);

    expect(result.exitCode).toBe(0);
    expect(capturedName).toBe('Alice');
  });

  it('args() returns parsed options with defaults', async () => {
    let capturedVerbose: boolean | undefined;
    let capturedPort: number | undefined;

    class ServeCommand {
      static schema = cliSchema({
        options: [
          { name: 'verbose', type: 'boolean', alias: 'v' },
          { name: 'port', type: 'number', default: 3000 },
        ],
      });

      run() {
        const parsed = args(ServeCommand);
        capturedVerbose = parsed.verbose;
        capturedPort = parsed.port;
      }
    }
    Command({ name: 'serve' })(ServeCommand);

    const app = createApp([command([ServeCommand])]);
    nodeApp = await onNode(app);

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected execCommand');
    const result = await nodeApp.execCommand(['serve', '-v']);

    expect(result.exitCode).toBe(0);
    expect(capturedVerbose).toBe(true);
    expect(capturedPort).toBe(3000);
  });
});

describe('command transient behavior', () => {
  it('creates new command instance for each execCommand call', async () => {
    const instanceIds: number[] = [];

    @Command({ name: 'track' })
    class TrackCommand {
      static schema = cliSchema({});
      private id = Math.random();

      run() {
        instanceIds.push(this.id);
      }
    }

    const app = createApp([command([TrackCommand])]);

    const nodeApp = await onNode(app);

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected execCommand');
    await nodeApp.execCommand(['track']);
    await nodeApp.execCommand(['track']);
    await nodeApp.execCommand(['track']);

    await nodeApp.shutdown();

    expect(instanceIds).toHaveLength(3);
    expect(new Set(instanceIds).size).toBe(3);
  });
});

describe('onNode with schedulers', () => {
  let nodeApp: NodeApp | undefined;

  afterEach(async () => {
    if (nodeApp && hasScheduler(nodeApp)) {
      await nodeApp.stopScheduler();
    }
    await nodeApp?.shutdown();
    nodeApp = undefined;
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

    const app = createApp([http({ controllers: [TestController] }), scheduler([TestScheduler])]);
    nodeApp = await onNode(app);

    expect('startScheduler' in nodeApp).toBe(true);
    expect('stopScheduler' in nodeApp).toBe(true);
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

    const app = createApp([http({ controllers: [TestController] }), scheduler([TestScheduler])]);
    nodeApp = await onNode(app);

    expect(taskFn).not.toHaveBeenCalled();

    if (!hasScheduler(nodeApp)) throw new Error('expected startScheduler');
    await nodeApp.startScheduler();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 2000 });
  });
});
