import type { HttpModuleOptions } from '@zeltjs/core';
import {
  Command,
  Config,
  Controller,
  cliSchema,
  command,
  createApp,
  EnvAdaptor,
  Feature,
  Get,
  HTTP_FEATURE_KEY,
  HttpFeature,
  http,
} from '@zeltjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { BunCliConfig } from './bun-cli.config';
import { BunEnvAdaptor } from './bun-env.adaptor';
import { onBun } from './on-bun';

const originalBun = globalThis.Bun;
const servedFetches: ((request: Request) => Promise<Response>)[] = [];
const servedServers: { readonly stop: ReturnType<typeof vi.fn> }[] = [];
const serveMock = vi.fn(
  (options: {
    readonly fetch: (request: Request) => Promise<Response>;
    readonly port?: number;
    readonly hostname?: string;
  }) => {
    servedFetches.push(options.fetch);
    const server = {
      hostname: options.hostname,
      port: options.port,
      stop: vi.fn(),
    };
    servedServers.push(server);
    return server;
  },
);

beforeAll(() => {
  Object.defineProperty(globalThis, 'Bun', {
    configurable: true,
    value: { argv: ['bun', 'test'], env: {}, serve: serveMock },
  });
});

beforeEach(() => {
  servedFetches.length = 0;
  servedServers.length = 0;
  serveMock.mockClear();
});

afterAll(() => {
  Object.defineProperty(globalThis, 'Bun', {
    configurable: true,
    value: originalBun,
  });
});

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

describe('onBun return types', () => {
  it('narrows adapter methods from configured features and keeps feature capabilities working', async () => {
    @Controller('/')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const httpFeature = http({ controllers: [TestController] });
    const httpOnly = await onBun(createApp([httpFeature]));

    expectTypeOf(httpOnly).not.toHaveProperty('serve');
    expectTypeOf(httpOnly.http).toHaveProperty('serve');
    expectTypeOf(httpOnly).not.toHaveProperty('execCommand');
    expect(httpOnly.hasFeature(HttpFeature)).toBe(true);

    const directResponse = await httpOnly.http.fetch(new Request('http://localhost/'));
    await expect(directResponse.json()).resolves.toEqual({ ok: true });

    const handle = httpOnly.http.serve({ hostname: '127.0.0.1', port: 4321 });
    expect(serveMock).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: '127.0.0.1', port: 4321 }),
    );
    expect(handle.address).toEqual({ hostname: '127.0.0.1', port: 4321 });
    const servedFetch = servedFetches[0];
    if (!servedFetch) throw new Error('expected Bun.serve fetch');
    const servedResponse = await servedFetch(new Request('http://localhost/'));
    await expect(servedResponse.json()).resolves.toEqual({ ok: true });

    await handle.shutdown();

    const runFn = vi.fn();
    class TestCommand {
      static schema = cliSchema({});
      run() {
        runFn();
      }
    }
    Command({ name: 'test' })(TestCommand);

    const commandFeature = command([TestCommand]);
    const commandOnly = await onBun(createApp([commandFeature]));

    expectTypeOf(commandOnly).toHaveProperty('commands');
    expectTypeOf(commandOnly).not.toHaveProperty('serve');
    expect('serve' in commandOnly).toBe(false);

    const commandResult = await commandOnly.commands.execCommand(['test']);
    expect(commandResult.exitCode).toBe(0);
    expect(runFn).toHaveBeenCalledOnce();

    await commandOnly.shutdown();

    const full = await onBun(createApp([httpFeature, commandFeature]));

    expectTypeOf(full).not.toHaveProperty('serve');
    expectTypeOf(full.http).toHaveProperty('serve');
    expectTypeOf(full).toHaveProperty('commands');

    const fullResult = await full.commands.execCommand(['test']);
    expect(fullResult.exitCode).toBe(0);

    await full.shutdown();
  });

  it('does not expose root serve for widened HttpFeature arrays', async () => {
    const maybeHttpFeatures: readonly HttpFeature[] = [];
    const maybeHttpApp = await onBun(createApp(maybeHttpFeatures));

    expectTypeOf(maybeHttpApp).not.toHaveProperty('serve');
    expect('serve' in maybeHttpApp).toBe(false);

    await maybeHttpApp.shutdown();
  });

  it('does not add serve for non-HttpFeature http-shaped capabilities', async () => {
    const bunApp = await onBun(createApp([new FakeHttpLikeFeature()]));

    expectTypeOf(bunApp).not.toHaveProperty('serve');
    expect('http' in bunApp).toBe(true);
    expect('serve' in bunApp).toBe(false);
    expect('serve' in bunApp.http).toBe(false);
    expect(bunApp.hasFeature(HttpFeature)).toBe(false);

    await bunApp.shutdown();
  });

  it('adds serve for HttpFeature subclasses', async () => {
    @Controller('/')
    class SubclassController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const shutdown = vi.fn();
    const bunApp = await onBun(
      createApp([new CustomHttpFeature({ controllers: [SubclassController] })]),
    );
    bunApp.registerShutdown(shutdown);

    expectTypeOf(bunApp).not.toHaveProperty('serve');
    expectTypeOf(bunApp.http).toHaveProperty('serve');
    expect('serve' in bunApp).toBe(false);
    expect('serve' in bunApp.http).toBe(true);
    expect(bunApp.hasFeature(HttpFeature)).toBe(true);

    await bunApp.shutdown();
    expect(shutdown).toHaveBeenCalledOnce();
  });

  it('adds serve for each named HTTP namespace', async () => {
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

    const bunApp = await onBun(
      createApp([
        http({ controllers: [PublicController] }),
        http({ name: 'private' as const, controllers: [PrivateController] }),
      ]),
    );

    const publicHandle = bunApp.http.serve({ port: 3000 });
    const privateHandle = bunApp.private.serve({ port: 3001 });

    expect('serve' in bunApp).toBe(false);
    expect(publicHandle.address.port).toBe(3000);
    expect(privateHandle.address.port).toBe(3001);

    const publicFetch = servedFetches[0];
    const privateFetch = servedFetches[1];
    if (!publicFetch || !privateFetch) throw new Error('expected Bun.serve fetches');

    expect((await publicFetch(new Request('http://localhost/public'))).status).toBe(200);
    expect((await publicFetch(new Request('http://localhost/private'))).status).toBe(404);
    expect((await privateFetch(new Request('http://localhost/private'))).status).toBe(200);
    expect((await privateFetch(new Request('http://localhost/public'))).status).toBe(404);

    await publicHandle.shutdown();
    await privateHandle.shutdown();
    await bunApp.shutdown();
  });

  it('app shutdown stops served servers through the HTTP feature shutdown hook', async () => {
    @Controller('/')
    class AppShutdownController {
      @Get('/')
      get() {
        return {};
      }
    }

    const bunApp = await onBun(createApp([http({ controllers: [AppShutdownController] })]));
    bunApp.http.serve({ port: 3000 });
    const server = servedServers[0];
    if (!server) throw new Error('expected Bun.serve server');

    await bunApp.shutdown();

    expect(server.stop).toHaveBeenCalledOnce();
  });

  it('passes config overrides to createRuntime()', async () => {
    @Config
    class TestEnvAdaptor extends EnvAdaptor {
      override get(key: string): string | undefined {
        return key === 'BUN_ENV' ? 'test-override' : undefined;
      }
    }

    const app = createApp([http({ controllers: [] })]);
    const readySpy = vi.spyOn(app, 'createRuntime');

    const bunApp = await onBun(app, { configs: [TestEnvAdaptor] });

    expect(readySpy).toHaveBeenCalledWith({
      configs: [TestEnvAdaptor],
      fallbackConfigs: [BunCliConfig, BunEnvAdaptor],
      warmup: true,
    });
    const env = await bunApp.get(EnvAdaptor);
    expect(env.get('BUN_ENV')).toBe('test-override');

    await bunApp.shutdown();
  });
});
