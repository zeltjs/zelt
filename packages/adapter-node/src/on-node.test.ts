import type { CommandCapabilities, HttpCapabilities, SchedulerCapabilities } from '@zeltjs/core';
import {
  args,
  Command,
  Controller,
  Cron,
  cliSchema,
  command,
  createApp,
  EnvAdaptor,
  Feature,
  Get,
  HttpFeature,
  http,
  Scheduled,
  scheduler,
} from '@zeltjs/core';
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest';

const originalMaxListeners = process.getMaxListeners();

beforeAll(() => {
  process.setMaxListeners(50);
});

afterAll(() => {
  process.setMaxListeners(originalMaxListeners);
});

import { NodeCliConfig } from './node-cli.config';
import type { NodeApp, ServerHandle } from './on-node';
import { onNode } from './on-node';
import { ProcessEnvAdaptor } from './process-env.adaptor';

type HttpNodeApp = NodeApp & { readonly http: HttpCapabilities } & {
  readonly listen: (
    portOrOptions?: number | { readonly port?: number; readonly hostname?: string },
  ) => Promise<ServerHandle>;
};
type CommandNodeApp = NodeApp & { readonly commands: CommandCapabilities };
type SchedulerNodeAppPart = { readonly schedulers: SchedulerCapabilities };

const isHttpNodeApp = (app: NodeApp): app is HttpNodeApp => 'listen' in app;
const isCommandNodeApp = (app: NodeApp): app is CommandNodeApp => 'commands' in app;
const hasScheduler = (app: NodeApp): app is NodeApp & SchedulerNodeAppPart => 'schedulers' in app;

class FakeHttpLikeFeature extends Feature<
  'http',
  {
    readonly fetch: (request: Request) => Promise<Response>;
    readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
  }
> {
  readonly key = 'http' as const;

  bind = vi.fn();
  staticCapabilities = () => ({});
  createCapabilities = () => ({
    fetch: async () => new Response('fake'),
    request: async () => new Response('fake'),
  });
}

class CustomHttpFeature extends HttpFeature {}

describe('onNode return types', () => {
  it('narrows adapter methods from configured features and keeps feature capabilities working', async () => {
    @Controller('/')
    class ReturnTypeController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const httpFeature = http({ controllers: [ReturnTypeController] });
    const httpOnly = await onNode(createApp([httpFeature]));

    expectTypeOf(httpOnly).toHaveProperty('listen');
    expectTypeOf(httpOnly).not.toHaveProperty('execCommand');
    expectTypeOf(httpOnly).not.toHaveProperty('startScheduler');
    expect(httpOnly.hasFeature(HttpFeature)).toBe(true);

    const directResponse = await httpOnly.http.fetch(new Request('http://localhost/'));
    await expect(directResponse.json()).resolves.toEqual({ ok: true });

    await httpOnly.shutdown();

    const runFn = vi.fn();
    class TestCommand {
      static schema = cliSchema({});
      run() {
        runFn();
      }
    }
    Command({ name: 'test' })(TestCommand);

    const commandFeature = command([TestCommand]);
    const commandOnly = await onNode(createApp([commandFeature]));

    expectTypeOf(commandOnly).toHaveProperty('commands');
    expectTypeOf(commandOnly).not.toHaveProperty('listen');
    expectTypeOf(commandOnly).not.toHaveProperty('schedulers');
    expect('listen' in commandOnly).toBe(false);

    const commandResult = await commandOnly.commands.execCommand(['test']);
    expect(commandResult.exitCode).toBe(0);
    expect(runFn).toHaveBeenCalledOnce();

    await commandOnly.shutdown();

    @Scheduled()
    class TestScheduler {
      @Cron('0 * * * *')
      hourlyTask() {}
    }

    const schedulerFeature = scheduler([TestScheduler]);
    const schedulerOnly = await onNode(createApp([schedulerFeature]));

    expectTypeOf(schedulerOnly).toHaveProperty('schedulers');
    expectTypeOf(schedulerOnly).not.toHaveProperty('listen');
    expectTypeOf(schedulerOnly).not.toHaveProperty('commands');

    expect(schedulerOnly.schedulers.isSchedulerRunning()).toBe(false);
    await schedulerOnly.schedulers.startScheduler();
    expect(schedulerOnly.schedulers.isSchedulerRunning()).toBe(true);
    await schedulerOnly.schedulers.stopScheduler();
    expect(schedulerOnly.schedulers.isSchedulerRunning()).toBe(false);

    await schedulerOnly.shutdown();

    const full = await onNode(createApp([httpFeature, commandFeature, schedulerFeature]));

    expectTypeOf(full).toHaveProperty('listen');
    expectTypeOf(full).toHaveProperty('commands');
    expectTypeOf(full).toHaveProperty('schedulers');

    const fullResponse = await full.http.fetch(new Request('http://localhost/'));
    await expect(fullResponse.json()).resolves.toEqual({ ok: true });
    const fullResult = await full.commands.execCommand(['test']);
    expect(fullResult.exitCode).toBe(0);
    expect(full.schedulers.isSchedulerRunning()).toBe(false);

    await full.shutdown();
  });

  it('keeps listen optional for widened HttpFeature arrays', async () => {
    const maybeHttpFeatures: readonly HttpFeature[] = [];
    const maybeHttpApp = await onNode(createApp(maybeHttpFeatures));

    expectTypeOf(maybeHttpApp)
      .toHaveProperty('listen')
      .toEqualTypeOf<
        | ((
            portOrOptions?: number | { readonly port?: number; readonly hostname?: string },
          ) => Promise<ServerHandle>)
        | undefined
      >();
    expect('listen' in maybeHttpApp).toBe(false);

    await maybeHttpApp.shutdown();
  });

  it('does not add listen for non-HttpFeature http-shaped capabilities', async () => {
    const nodeApp = await onNode(createApp([new FakeHttpLikeFeature()]));

    expectTypeOf(nodeApp).not.toHaveProperty('listen');
    expect('http' in nodeApp).toBe(true);
    expect('listen' in nodeApp).toBe(false);
    expect(nodeApp.hasFeature(HttpFeature)).toBe(false);

    await nodeApp.shutdown();
  });

  it('adds listen for HttpFeature subclasses', async () => {
    @Controller('/')
    class SubclassController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const nodeApp = await onNode(
      createApp([new CustomHttpFeature({ controllers: [SubclassController] })]),
    );

    expectTypeOf(nodeApp).toHaveProperty('listen');
    expect('listen' in nodeApp).toBe(true);
    expect(nodeApp.hasFeature(HttpFeature)).toBe(true);

    await nodeApp.shutdown();
  });
});

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

  it('calls app.createRuntime() during onNode', async () => {
    @Controller('/health')
    class HealthController {
      @Get('/')
      check() {
        return { status: 'ok' };
      }
    }

    const app = createApp([http({ controllers: [HealthController] })]);
    const readySpy = vi.spyOn(app, 'createRuntime');

    nodeApp = await onNode(app);

    expect(readySpy).toHaveBeenCalledOnce();

    if (!isHttpNodeApp(nodeApp)) throw new Error('expected listen');
    handle = await nodeApp.listen(0);
    const res = await fetch(`http://localhost:${handle.address.port}/health/`);
    const body: { status: string } = await res.json();
    expect(body.status).toBe('ok');
  });

  it('passes fallback configs to createRuntime()', async () => {
    const app = createApp([http({ controllers: [] })], { configs: [EnvAdaptor] });
    const readySpy = vi.spyOn(app, 'createRuntime');

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

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected commands');
    const result = await nodeApp.commands.execCommand(['test-cmd']);

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

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected commands');
    const result = await nodeApp.commands.execCommand(['nonexistent']);

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

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected commands');
    const result = await nodeApp.commands.execCommand([]);

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

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected commands');
    const result = await nodeApp.commands.execCommand(['failing']);

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

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected commands');
    const result = await nodeApp.commands.execCommand(['greet', 'Alice']);

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

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected commands');
    const result = await nodeApp.commands.execCommand(['serve', '-v']);

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

    await nodeApp.commands.execCommand(['track']);
    await nodeApp.commands.execCommand(['track']);
    await nodeApp.commands.execCommand(['track']);

    await nodeApp.shutdown();

    expect(instanceIds).toHaveLength(3);
    expect(new Set(instanceIds).size).toBe(3);
  });
});

describe('onNode with schedulers', () => {
  let nodeApp: NodeApp | undefined;

  afterEach(async () => {
    if (nodeApp && hasScheduler(nodeApp)) {
      await nodeApp.schedulers.stopScheduler();
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

    expect('schedulers' in nodeApp).toBe(true);
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

    if (!hasScheduler(nodeApp)) throw new Error('expected schedulers');
    await nodeApp.schedulers.startScheduler();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 2000 });
  });
});
