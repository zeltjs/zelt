import type {
  CommandCapabilities,
  ConfiguredFeature,
  CreateAppOptions,
  HttpCapabilities,
  HttpModuleOptions,
  HttpServerCapabilities,
  SchedulerCapabilities,
  ZeltPrebuilt,
} from '@zeltjs/core';
import {
  args,
  Command,
  Config,
  Controller,
  Cron,
  cliSchema,
  command,
  createApp,
  EnvAdaptor,
  Feature,
  Get,
  HTTP_FEATURE_KEY,
  HttpFeature,
  http,
  httpServer,
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
import { NodeHttpServerAdaptor } from './node-http-server.adaptor';
import type { ServerHandle } from './on-node';
import { onNode } from './on-node';
import { ProcessEnvAdaptor } from './process-env.adaptor';

type NodeApp = Awaited<ReturnType<typeof onNode>>;
type HttpNodeApp = NodeApp & {
  readonly http: HttpCapabilities;
  readonly server: HttpServerCapabilities;
};
type CommandNodeApp = NodeApp & { readonly commands: CommandCapabilities };
type SchedulerNodeAppPart = { readonly schedulers: SchedulerCapabilities };

const hasMethods = (value: object | undefined, names: readonly string[]): boolean =>
  value !== undefined && names.every((name) => typeof Reflect.get(value, name) === 'function');
const isHttpNodeApp = (app: NodeApp): app is HttpNodeApp =>
  hasMethods(app['http'], ['fetch', 'request']) && hasMethods(app['server'], ['listen']);
const createServerApp = <const F extends readonly ConfiguredFeature[]>(
  features: F,
  options?: CreateAppOptions,
) => createApp([...features, httpServer()], options);
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

  featureClasses = () => [];
  blueprint = () => ({});
  realize = () => ({
    fetch: async () => new Response('fake'),
    request: async () => new Response('fake'),
  });
}

class CustomHttpFeature extends HttpFeature<typeof HTTP_FEATURE_KEY> {
  constructor(opts: HttpModuleOptions<typeof HTTP_FEATURE_KEY>) {
    super(opts, HTTP_FEATURE_KEY);
  }
}

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

    expectTypeOf(httpOnly).not.toHaveProperty('listen');
    expectTypeOf(httpOnly.http).not.toHaveProperty('listen');
    expectTypeOf(httpOnly).not.toHaveProperty('execCommand');
    expectTypeOf(httpOnly).not.toHaveProperty('startScheduler');
    expect(httpOnly.hasFeature(HttpFeature)).toBe(true);

    const directResponse = await httpOnly.http.fetch(new Request('http://localhost/'));
    await expect(directResponse.json()).resolves.toEqual({ ok: true });

    await httpOnly.shutdown();

    const runFn = vi.fn();
    class TestCommand {
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

    expectTypeOf(full).not.toHaveProperty('listen');
    expectTypeOf(full.http).not.toHaveProperty('listen');
    expectTypeOf(full).toHaveProperty('commands');
    expectTypeOf(full).toHaveProperty('schedulers');

    const fullResponse = await full.http.fetch(new Request('http://localhost/'));
    await expect(fullResponse.json()).resolves.toEqual({ ok: true });
    const fullResult = await full.commands.execCommand(['test']);
    expect(fullResult.exitCode).toBe(0);
    expect(full.schedulers.isSchedulerRunning()).toBe(false);

    await full.shutdown();
  });

  it('does not expose root listen for widened HttpFeature arrays', async () => {
    const maybeHttpFeatures: readonly HttpFeature[] = [];
    const maybeHttpApp = await onNode(createApp(maybeHttpFeatures));

    expect('listen' in maybeHttpApp).toBe(false);

    await maybeHttpApp.shutdown();
  });

  it('does not add listen for non-HttpFeature http-shaped capabilities', async () => {
    const nodeApp = await onNode(createApp([new FakeHttpLikeFeature()]));

    expectTypeOf(nodeApp).not.toHaveProperty('listen');
    expect('http' in nodeApp).toBe(true);
    expect('listen' in nodeApp).toBe(false);
    expect('listen' in nodeApp.http).toBe(false);
    expect(nodeApp.hasFeature(HttpFeature)).toBe(false);

    await nodeApp.shutdown();
  });

  it('keeps HTTP capabilities portable for HttpFeature subclasses', async () => {
    @Controller('/')
    class SubclassController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const shutdown = vi.fn();
    const nodeApp = await onNode(
      createApp([new CustomHttpFeature({ controllers: [SubclassController] })]),
    );
    nodeApp.registerShutdown(shutdown);

    expectTypeOf(nodeApp).not.toHaveProperty('listen');
    expectTypeOf(nodeApp.http).not.toHaveProperty('listen');
    expect('listen' in nodeApp).toBe(false);
    expect('listen' in nodeApp.http).toBe(false);
    expect(nodeApp.hasFeature(HttpFeature)).toBe(true);

    await nodeApp.shutdown();
    expect(shutdown).toHaveBeenCalledOnce();
  });
});

describe('onNode with HTTP', () => {
  let nodeApp: NodeApp | undefined;
  let handle: ServerHandle | undefined;

  afterEach(async () => {
    await handle?.shutdown();
    await nodeApp?.shutdown();
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

    const app = createServerApp([http({ controllers: [TestController] })]);
    nodeApp = await onNode(app);

    expect(isHttpNodeApp(nodeApp)).toBe(true);
    if (!isHttpNodeApp(nodeApp)) throw new Error('expected listen');
    handle = await nodeApp.server.listen(nodeApp.http, 0);

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

    const app = createServerApp([http({ controllers: [PingController] })]);
    nodeApp = await onNode(app);

    if (!isHttpNodeApp(nodeApp)) throw new Error('expected listen');
    handle = await nodeApp.server.listen(nodeApp.http, 0);

    expect(handle.address.port).toBeGreaterThan(0);
    const res = await fetch(`http://localhost:${handle.address.port}/`);
    expect(res.status).toBe(200);
  });

  it('rejects instead of hanging when the port is already in use', async () => {
    @Controller('/')
    class ConflictController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createServerApp([http({ controllers: [ConflictController] })]);
    nodeApp = await onNode(app);

    if (!isHttpNodeApp(nodeApp)) throw new Error('expected listen');
    handle = await nodeApp.server.listen(nodeApp.http, 0);

    await expect(nodeApp.server.listen(nodeApp.http, handle.address.port)).rejects.toThrow();
  });

  it('listens on each named HTTP namespace independently', async () => {
    @Controller('/')
    class PublicController {
      @Get('/public')
      getPublic() {
        return { scope: 'public' };
      }
    }

    @Controller('/')
    class PrivateController {
      @Get('/private')
      getPrivate() {
        return { scope: 'private' };
      }
    }

    const app = createServerApp([
      http({ controllers: [PublicController] }),
      http({ name: 'private' as const, controllers: [PrivateController] }),
    ]);
    const namedNodeApp = await onNode(app);

    const publicHandle = await namedNodeApp.server.listen(namedNodeApp.http, 0);
    const privateHandle = await namedNodeApp.server.listen(namedNodeApp.private, 0);

    try {
      expect('listen' in namedNodeApp).toBe(false);

      const publicOk = await fetch(`http://localhost:${publicHandle.address.port}/public`);
      expect(publicOk.status).toBe(200);
      await expect(publicOk.json()).resolves.toEqual({ scope: 'public' });

      const publicMiss = await fetch(`http://localhost:${publicHandle.address.port}/private`);
      expect(publicMiss.status).toBe(404);

      const privateOk = await fetch(`http://localhost:${privateHandle.address.port}/private`);
      expect(privateOk.status).toBe(200);
      await expect(privateOk.json()).resolves.toEqual({ scope: 'private' });

      const privateMiss = await fetch(`http://localhost:${privateHandle.address.port}/public`);
      expect(privateMiss.status).toBe(404);
    } finally {
      await publicHandle.shutdown();
      await privateHandle.shutdown();
      await namedNodeApp.shutdown();
    }
  });

  it('keeps listeners isolated across runtimes created from one app definition', async () => {
    @Controller('/')
    class SharedController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createServerApp([http({ controllers: [SharedController] })]);
    const first = await onNode(app);
    const second = await onNode(app);
    const firstHandle = await first.server.listen(first.http, 0);
    const secondHandle = await second.server.listen(second.http, 0);

    try {
      await first.shutdown();

      const response = await fetch(`http://localhost:${secondHandle.address.port}/`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    } finally {
      await firstHandle.shutdown();
      await secondHandle.shutdown();
      await first.shutdown();
      await second.shutdown();
    }
  });

  it('calls app.createRuntime() during onNode', async () => {
    @Controller('/health')
    class HealthController {
      @Get('/')
      check() {
        return { status: 'ok' };
      }
    }

    const app = createServerApp([http({ controllers: [HealthController] })]);
    const readySpy = vi.spyOn(app, 'createRuntime');

    nodeApp = await onNode(app);

    expect(readySpy).toHaveBeenCalledOnce();

    if (!isHttpNodeApp(nodeApp)) throw new Error('expected listen');
    handle = await nodeApp.server.listen(nodeApp.http, 0);
    const res = await fetch(`http://localhost:${handle.address.port}/health/`);
    const body: { status: string } = await res.json();
    expect(body.status).toBe('ok');
  });

  it('passes fallback configs to createRuntime()', async () => {
    const app = createServerApp([http({ controllers: [] })], { configs: [EnvAdaptor] });
    const readySpy = vi.spyOn(app, 'createRuntime');

    nodeApp = await onNode(app);

    expect(readySpy).toHaveBeenCalledWith({
      fallbackConfigs: [NodeCliConfig, ProcessEnvAdaptor, NodeHttpServerAdaptor],
      warmup: true,
    });
  });

  it('passes config overrides to createRuntime()', async () => {
    @Config
    class TestEnvAdaptor extends EnvAdaptor {
      override get(key: string): string | undefined {
        return key === 'NODE_ENV' ? 'test-override' : undefined;
      }
    }

    const app = createServerApp([http({ controllers: [] })]);
    const readySpy = vi.spyOn(app, 'createRuntime');

    nodeApp = await onNode(app, { configs: [TestEnvAdaptor] });

    expect(readySpy).toHaveBeenCalledWith({
      configs: [TestEnvAdaptor],
      fallbackConfigs: [NodeCliConfig, ProcessEnvAdaptor, NodeHttpServerAdaptor],
      warmup: true,
    });
    const env = await nodeApp.get(EnvAdaptor);
    expect(env.get('NODE_ENV')).toBe('test-override');
  });

  it('passes prebuilt to createRuntime()', async () => {
    const app = createServerApp([http({ controllers: [] })]);
    const readySpy = vi.spyOn(app, 'createRuntime');
    const prebuilt: ZeltPrebuilt = { version: 1, features: {} };

    nodeApp = await onNode(app, { prebuilt });

    expect(readySpy).toHaveBeenCalledWith({
      prebuilt,
      fallbackConfigs: [NodeCliConfig, ProcessEnvAdaptor, NodeHttpServerAdaptor],
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

    const app = createServerApp([http({ controllers: [SimpleController] })]);
    nodeApp = await onNode(app);

    if (!isHttpNodeApp(nodeApp)) throw new Error('expected listen');
    handle = await nodeApp.server.listen(nodeApp.http, 0);

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

    const app = createServerApp([http({ controllers: [ShutdownController] })]);
    nodeApp = await onNode(app);

    if (!isHttpNodeApp(nodeApp)) throw new Error('expected listen');
    handle = await nodeApp.server.listen(nodeApp.http, 0);
    const { port } = handle.address;

    await handle.shutdown();
    handle = undefined;

    await expect(fetch(`http://localhost:${port}/`)).rejects.toThrow();
  });

  it('app shutdown stops listening servers through the HTTP feature shutdown hook', async () => {
    @Controller('/')
    class AppShutdownController {
      @Get('/')
      get() {
        return {};
      }
    }

    const app = createServerApp([http({ controllers: [AppShutdownController] })]);
    nodeApp = await onNode(app);

    if (!isHttpNodeApp(nodeApp)) throw new Error('expected listen');
    handle = await nodeApp.server.listen(nodeApp.http, 0);
    const { port } = handle.address;

    await nodeApp.shutdown();
    nodeApp = undefined;
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

    const app = createServerApp([http({ controllers: [ServiceController] })], {
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
      run() {
        runFn();
      }
    }
    Command({ name: 'test-cmd' })(TestCommand);

    const app = createServerApp([command([TestCommand])]);
    nodeApp = await onNode(app);

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected commands');
    const result = await nodeApp.commands.execCommand(['test-cmd']);

    expect(result.exitCode).toBe(0);
    expect(runFn).toHaveBeenCalled();
  });

  it('returns exitCode 1 when command not found', async () => {
    class ExistingCommand {
      run() {}
    }
    Command({ name: 'existing' })(ExistingCommand);

    const app = createServerApp([command([ExistingCommand])]);
    nodeApp = await onNode(app);

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected commands');
    const result = await nodeApp.commands.execCommand(['nonexistent']);

    expect(result.exitCode).toBe(1);
  });

  it('returns exitCode 1 when no command specified', async () => {
    class TestCommand {
      run() {}
    }
    Command({ name: 'test' })(TestCommand);

    const app = createServerApp([command([TestCommand])]);
    nodeApp = await onNode(app);

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected commands');
    const result = await nodeApp.commands.execCommand([]);

    expect(result.exitCode).toBe(1);
  });

  it('returns exitCode 1 when command throws', async () => {
    class FailingCommand {
      run() {
        throw new Error('Command failed');
      }
    }
    Command({ name: 'failing' })(FailingCommand);

    const app = createServerApp([command([FailingCommand])]);
    nodeApp = await onNode(app);

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected commands');
    const result = await nodeApp.commands.execCommand(['failing']);

    expect(result.exitCode).toBe(1);
  });

  it('args() returns parsed arguments within command', async () => {
    let capturedName: string | undefined;

    const greetSchema = cliSchema({
      args: [{ name: 'name', type: 'string' }],
    });

    class GreetCommand {
      run() {
        const parsed = args(greetSchema);
        capturedName = parsed.name;
      }
    }
    Command({ name: 'greet' })(GreetCommand);

    const app = createServerApp([command([GreetCommand])]);
    nodeApp = await onNode(app);

    if (!isCommandNodeApp(nodeApp)) throw new Error('expected commands');
    const result = await nodeApp.commands.execCommand(['greet', 'Alice']);

    expect(result.exitCode).toBe(0);
    expect(capturedName).toBe('Alice');
  });

  it('args() returns parsed options with defaults', async () => {
    let capturedVerbose: boolean | undefined;
    let capturedPort: number | undefined;

    const serveSchema = cliSchema({
      options: [
        { name: 'verbose', type: 'boolean', alias: 'v' },
        { name: 'port', type: 'number', default: 3000 },
      ],
    });

    class ServeCommand {
      run() {
        const parsed = args(serveSchema);
        capturedVerbose = parsed.verbose;
        capturedPort = parsed.port;
      }
    }
    Command({ name: 'serve' })(ServeCommand);

    const app = createServerApp([command([ServeCommand])]);
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
      private id = Math.random();

      run() {
        instanceIds.push(this.id);
      }
    }

    const app = createServerApp([command([TrackCommand])]);

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

    const app = createServerApp([
      http({ controllers: [TestController] }),
      scheduler([TestScheduler]),
    ]);
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

    const app = createServerApp([
      http({ controllers: [TestController] }),
      scheduler([TestScheduler]),
    ]);
    nodeApp = await onNode(app);

    expect(taskFn).not.toHaveBeenCalled();

    if (!hasScheduler(nodeApp)) throw new Error('expected schedulers');
    await nodeApp.schedulers.startScheduler();

    await vi.waitFor(() => expect(taskFn).toHaveBeenCalled(), { timeout: 2000 });
  });
});
