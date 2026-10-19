import type { HttpModuleOptions, ZeltPrebuilt } from '@zeltjs/core';
import {
  Command,
  Config,
  Controller,
  command,
  createApp,
  EnvAdaptor,
  Feature,
  Get,
  HTTP_FEATURE_KEY,
  HttpFeature,
  HttpServerFeature,
  http,
  httpServer,
  injectFeature,
} from '@zeltjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { BunCliConfig } from './bun-cli.config';
import { BunEnvAdaptor } from './bun-env.adaptor';
import { BunHttpServerAdaptor } from './bun-http-server.adaptor';
import { onBun } from './on-bun';

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
  vi.stubGlobal('Bun', { argv: ['bun', 'test'], env: {}, serve: serveMock });
});

beforeEach(() => {
  servedFetches.length = 0;
  servedServers.length = 0;
  serveMock.mockClear();
});

afterAll(() => {
  vi.unstubAllGlobals();
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
  it('starts listeners through injected HTTP and server features only when requested', async () => {
    let closed: Promise<void> | undefined;
    @Command({ name: 'serve' })
    class Serve {
      private readonly http = injectFeature(HttpFeature);
      private readonly server = injectFeature(HttpServerFeature);
      async run() {
        const server = await this.server.listen(this.http, { port: 3456 });
        closed = server.closed;
        expect(server.address).toEqual({ port: 3456, address: '0.0.0.0' });
      }
    }
    const app = await onBun(createApp([command([Serve]), http({ controllers: [] }), httpServer()]));
    try {
      expect(serveMock).not.toHaveBeenCalled();
      expect((await app.command.execCommand(['serve'])).exitCode).toBe(0);
      expect(serveMock).toHaveBeenCalledOnce();
      await app.shutdown();
      await closed;
      expect(servedServers[0]?.stop).toHaveBeenCalledOnce();
    } finally {
      await app.shutdown();
    }
  });

  it('narrows adapter methods from configured features and keeps feature capabilities working', async () => {
    @Controller('/')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const httpFeature = http({ controllers: [TestController] });
    const httpOnly = await onBun(createApp([httpFeature, httpServer()]));

    expectTypeOf(httpOnly).not.toHaveProperty('serve');
    expectTypeOf(httpOnly.http).not.toHaveProperty('serve');
    expectTypeOf(httpOnly).not.toHaveProperty('execCommand');
    expect(httpOnly.hasFeature(HttpFeature)).toBe(true);

    const directResponse = await httpOnly.http.fetch(new Request('http://localhost/'));
    await expect(directResponse.json()).resolves.toEqual({ ok: true });

    const handle = await httpOnly.httpServer.listen(httpOnly.http, {
      hostname: '127.0.0.1',
      port: 4321,
    });
    expect(serveMock).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: '127.0.0.1', port: 4321 }),
    );
    expect(handle.address).toEqual({ address: '127.0.0.1', port: 4321 });
    const servedFetch = servedFetches[0];
    if (!servedFetch) throw new Error('expected Bun.serve fetch');
    const servedResponse = await servedFetch(new Request('http://localhost/'));
    await expect(servedResponse.json()).resolves.toEqual({ ok: true });

    await handle.shutdown();

    const runFn = vi.fn();
    class TestCommand {
      run() {
        runFn();
      }
    }
    Command({ name: 'test' })(TestCommand);

    const commandFeature = command([TestCommand]);
    const commandOnly = await onBun(createApp([commandFeature]));

    expectTypeOf(commandOnly).toHaveProperty('command');
    expectTypeOf(commandOnly).not.toHaveProperty('serve');
    expect('serve' in commandOnly).toBe(false);

    const commandResult = await commandOnly.command.execCommand(['test']);
    expect(commandResult.exitCode).toBe(0);
    expect(runFn).toHaveBeenCalledOnce();

    await commandOnly.shutdown();

    const full = await onBun(createApp([httpFeature, commandFeature]));

    expectTypeOf(full).not.toHaveProperty('serve');
    expectTypeOf(full.http).not.toHaveProperty('serve');
    expectTypeOf(full).toHaveProperty('command');

    const fullResult = await full.command.execCommand(['test']);
    expect(fullResult.exitCode).toBe(0);

    await full.shutdown();
  });

  it('does not expose root serve for widened HttpFeature arrays', async () => {
    const maybeHttpFeatures: readonly HttpFeature[] = [];
    const maybeHttpApp = await onBun(createApp(maybeHttpFeatures));

    // Widened feature keys can include "serve" as a namespace, so only its
    // absence on this particular empty runtime can be asserted.
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

  it('keeps HTTP capabilities portable for HttpFeature subclasses', async () => {
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
    expectTypeOf(bunApp.http).not.toHaveProperty('serve');
    expect('serve' in bunApp).toBe(false);
    expect('serve' in bunApp.http).toBe(false);
    expect(bunApp.hasFeature(HttpFeature)).toBe(true);

    await bunApp.shutdown();
    expect(shutdown).toHaveBeenCalledOnce();
  });

  it('serves selected named HTTP features through one server feature', async () => {
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
        httpServer(),
        http({ name: 'private' as const, controllers: [PrivateController] }),
      ]),
    );

    const publicHandle = await bunApp.httpServer.listen(bunApp.http, { port: 3000 });
    const privateHandle = await bunApp.httpServer.listen(bunApp.private, { port: 3001 });

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

  it('app shutdown stops listeners owned by the server feature', async () => {
    @Controller('/')
    class AppShutdownController {
      @Get('/')
      get() {
        return {};
      }
    }

    const bunApp = await onBun(
      createApp([http({ controllers: [AppShutdownController] }), httpServer()]),
    );
    await bunApp.httpServer.listen(bunApp.http, { port: 3000 });
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
      fallbackConfigs: [BunCliConfig, BunEnvAdaptor, BunHttpServerAdaptor],
      warmup: true,
    });
    const env = await bunApp.get(EnvAdaptor);
    expect(env.get('BUN_ENV')).toBe('test-override');

    await bunApp.shutdown();
  });

  it('passes prebuilt to createRuntime()', async () => {
    const app = createApp([http({ controllers: [] })]);
    const readySpy = vi.spyOn(app, 'createRuntime');
    const prebuilt: ZeltPrebuilt = { version: 1, features: {} };

    const bunApp = await onBun(app, { prebuilt });

    expect(readySpy).toHaveBeenCalledWith({
      prebuilt,
      fallbackConfigs: [BunCliConfig, BunEnvAdaptor, BunHttpServerAdaptor],
      warmup: true,
    });

    await bunApp.shutdown();
  });
});
