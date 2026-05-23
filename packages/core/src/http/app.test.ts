import { injectable } from '@needle-di/core';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '../app';
import { createApp } from '../app';
import type { ControllerClass } from '../app/modules/http-module';
import { Config } from '../config';
import { inject } from '../di/inject';
import type { Lifecycle } from '../lifecycle';
import { LifecycleManager } from '../lifecycle';

import { Controller } from './decorators/controller';
import { ErrorHandler } from './decorators/error-handler';
import { Get, Post } from './decorators/http-method';
import { Middleware } from './decorators/middleware';
import { SkipMiddleware } from './decorators/skip-middleware';
import { UseMiddleware } from './decorators/use-middleware';
import { body } from './primitives/body';
import { getContext } from './primitives/get-context';
import { pathParam } from './primitives/path-param';

declare module '@zeltjs/core' {
  interface RequestContextSchema {
    configValue: string;
  }
}

@injectable()
class Greeter {
  greet(name: string) {
    return `hello, ${name}`;
  }
}

@Controller('/hello')
class HelloController {
  constructor(private greeter = inject(Greeter)) {}

  @Get('/:name')
  greet() {
    return { message: this.greeter.greet(pathParam('name')) };
  }
}

@Controller('/echo')
class EchoController {
  @Post('/')
  create(data = body('json')) {
    return data;
  }
}

@Controller('/upload')
class UploadController {
  @Post('/')
  upload(formData = body('form')) {
    const description = formData?.['description'] as string;
    const file = formData?.['file'] as File;
    return { description, filename: file.name, size: file.size };
  }
}

const buildApp = async () => {
  const app = createApp({
    http: { controllers: [HelloController, EchoController, UploadController] },
  });
  await app.ready();
  return app;
};

describe('createApp() — fetch', () => {
  it('serves a constructor-injected GET endpoint with pathParam', async () => {
    const app = await buildApp();
    const res = await app.fetch(new Request('https://example.com/hello/zelt'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, zelt' });
  });

  it('parses JSON body', async () => {
    const app = await buildApp();
    const res = await app.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg: 'ok' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ msg: 'ok' });
  });

  it('parses multipart/form-data with File', async () => {
    const app = await buildApp();
    const formData = new FormData();
    formData.append('description', 'test file');
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));

    const res = await app.fetch(
      new Request('https://example.com/upload/', {
        method: 'POST',
        body: formData,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ description: 'test file', filename: 'test.txt', size: 11 });
  });

  it('mounts multiple controllers under different base paths', async () => {
    const app = await buildApp();
    const a = await app.fetch(new Request('https://example.com/hello/x'));
    const b = await app.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg: 'y' }),
      }),
    );
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it('throws at ready() when a controller is missing @Controller', async () => {
    class NoDecorator {
      @Get('/')
      list() {}
    }
    new NoDecorator();
    const app = createApp({ http: { controllers: [NoDecorator] } });
    await expect(app.ready()).rejects.toThrow(/missing @Controller/);
  });
});

describe('createApp() — request', () => {
  it('accepts a path string with no init (defaults to GET)', async () => {
    const app = await buildApp();
    const res = await app.request('/hello/zelt');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, zelt' });
  });

  it('accepts a path string with init for POST + JSON body', async () => {
    const app = await buildApp();
    const res = await app.request('/echo/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msg: 'ok' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ msg: 'ok' });
  });

  it('accepts a raw Request instance', async () => {
    const app = await buildApp();
    const res = await app.request(new Request('https://x/hello/zelt'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, zelt' });
  });

  it('ignores init when input is a Request (Request takes precedence)', async () => {
    const app = await buildApp();
    // Request の method は GET、init で POST を指定しても Request 側が優先される
    const res = await app.request(new Request('https://x/hello/zelt'), { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, zelt' });
  });
});

describe('error paths', () => {
  it('returns 500 when pathParam() asks for a missing parameter', async () => {
    @Controller('/x')
    class BrokenController {
      @Get('/')
      run() {
        return { v: pathParam('id') };
      }
    }
    const app = createApp({ http: { controllers: [BrokenController] } });
    await app.ready();
    const res = await app.fetch(new Request('https://example.com/x/'));
    expect(res.status).toBe(500);
  });
});

describe('middleware', () => {
  it('executes global middleware on all routes', async () => {
    const executed: string[] = [];
    const trackMiddleware: MiddlewareHandler = async (_c, next) => {
      executed.push('global');
      await next();
    };

    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp({
      http: {
        controllers: [TestController],
        middlewares: [trackMiddleware],
      },
    });
    await app.ready();

    await app.request('/test/');
    expect(executed).toContain('global');
  });

  it('executes middlewares in order: global -> controller -> method', async () => {
    const order: string[] = [];
    const globalMiddleware: MiddlewareHandler = async (_c, next) => {
      order.push('global');
      await next();
    };
    const controllerMiddleware: MiddlewareHandler = async (_c, next) => {
      order.push('controller');
      await next();
    };
    const methodMiddleware: MiddlewareHandler = async (_c, next) => {
      order.push('method');
      await next();
    };

    @UseMiddleware(controllerMiddleware)
    @Controller('/test')
    class TestController {
      @UseMiddleware(methodMiddleware)
      @Get('/')
      get() {
        order.push('handler');
        return { ok: true };
      }
    }

    const app = createApp({
      http: {
        controllers: [TestController],
        middlewares: [globalMiddleware],
      },
    });
    await app.ready();

    await app.request('/test/');
    expect(order).toEqual(['global', 'controller', 'method', 'handler']);
  });

  it('skips global middleware with @SkipMiddleware', async () => {
    const executed: string[] = [];
    const authMiddleware: MiddlewareHandler = async (_c, next) => {
      executed.push('auth');
      await next();
    };

    @Controller('/test')
    class TestController {
      @Get('/protected')
      protected() {
        executed.push('protected');
        return { ok: true };
      }

      @SkipMiddleware(authMiddleware)
      @Get('/public')
      public() {
        executed.push('public');
        return { ok: true };
      }
    }

    const app = createApp({
      http: {
        controllers: [TestController],
        middlewares: [authMiddleware],
      },
    });
    await app.ready();

    executed.length = 0;
    await app.request('/test/protected');
    expect(executed).toEqual(['auth', 'protected']);

    executed.length = 0;
    await app.request('/test/public');
    expect(executed).toEqual(['public']);
  });

  it('resolves @Middleware class through DI', async () => {
    @injectable()
    class ConfigService {
      getValue() {
        return 'injected-value';
      }
    }

    @Middleware
    class DIMiddleware {
      constructor(private config = inject(ConfigService)) {}

      async use(c: Context, next: Next): Promise<Response | undefined> {
        c.set('configValue', this.config.getValue());
        await next();
        return undefined;
      }
    }

    @Controller('/test')
    @UseMiddleware(DIMiddleware)
    class TestController {
      @Get('/')
      get() {
        return { value: getContext('configValue') };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();
    const res = await app.request('/test/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'injected-value' });
  });

  it('middleware can set context values accessible in handler via getContext()', async () => {
    const setUserMiddleware: MiddlewareHandler = async (c, next) => {
      c.set('user', { id: 123, name: 'alice' });
      await next();
    };

    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        const user = getContext('user') as { id: number; name: string } | undefined;
        return { userId: user?.id, userName: user?.name };
      }
    }

    const app = createApp({
      http: {
        controllers: [TestController],
        middlewares: [setUserMiddleware],
      },
    });
    await app.ready();

    const res = await app.request('/test/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 123, userName: 'alice' });
  });

  it('middleware exception is handled by Koya error handler', async () => {
    const throwingMiddleware: MiddlewareHandler = async () => {
      throw new Error('middleware error');
    };

    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp({
      http: {
        controllers: [TestController],
        middlewares: [throwingMiddleware],
      },
    });
    await app.ready();

    const res = await app.request('/test/');
    expect(res.status).toBe(500);
  });

  it('middleware can return Response to short-circuit', async () => {
    const earlyReturnMiddleware: MiddlewareHandler = async () => {
      return new Response(JSON.stringify({ blocked: true }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    };

    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp({
      http: {
        controllers: [TestController],
        middlewares: [earlyReturnMiddleware],
      },
    });
    await app.ready();

    const res = await app.request('/test/');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ blocked: true });
  });
});

describe('errorHandlers', () => {
  it('handles errors thrown in controller', async () => {
    class CustomError extends Error {
      constructor(
        message: string,
        public code: string,
      ) {
        super(message);
      }
    }

    @ErrorHandler
    class CustomErrorHandler {
      onError(error: Error, _c: Context) {
        if (error instanceof CustomError) {
          return Response.json({ code: error.code, message: error.message }, { status: 400 });
        }
        return undefined;
      }
    }

    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        throw new CustomError('invalid input', 'INVALID_INPUT');
      }
    }

    const app = createApp({
      http: {
        controllers: [TestController],
        errorHandlers: [CustomErrorHandler],
      },
    });
    await app.ready();

    const res = await app.request('/test/');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'INVALID_INPUT', message: 'invalid input' });
  });

  it('falls back to default handler when error handler returns undefined', async () => {
    @ErrorHandler
    class SelectiveErrorHandler {
      onError(_error: Error, _c: Context) {
        return undefined;
      }
    }

    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        throw new Error('unhandled error');
      }
    }

    const app = createApp({
      http: {
        controllers: [TestController],
        errorHandlers: [SelectiveErrorHandler],
      },
    });
    await app.ready();

    const res = await app.request('/test/');
    expect(res.status).toBe(500);
  });

  it('executes multiple error handlers in order until one handles', async () => {
    const order: string[] = [];

    @ErrorHandler
    class FirstErrorHandler {
      onError(_error: Error, _c: Context) {
        order.push('first');
        return undefined;
      }
    }

    @ErrorHandler
    class SecondErrorHandler {
      onError(error: Error, _c: Context) {
        order.push('second');
        return Response.json({ handled: true, message: error.message }, { status: 500 });
      }
    }

    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        throw new Error('test error');
      }
    }

    const app = createApp({
      http: {
        controllers: [TestController],
        errorHandlers: [FirstErrorHandler, SecondErrorHandler],
      },
    });
    await app.ready();

    const res = await app.request('/test/');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ handled: true, message: 'test error' });
    expect(order).toEqual(['first', 'second']);
  });

  it('middlewares and errorHandlers work together', async () => {
    const executed: string[] = [];

    const beforeMiddleware: MiddlewareHandler = async (_c, next) => {
      executed.push('middleware');
      await next();
    };

    @ErrorHandler
    class TestErrorHandler {
      onError(error: Error, _c: Context) {
        executed.push('errorHandler');
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        executed.push('handler');
        throw new Error('test');
      }
    }

    const app = createApp({
      http: {
        controllers: [TestController],
        middlewares: [beforeMiddleware],
        errorHandlers: [TestErrorHandler],
      },
    });
    await app.ready();

    await app.request('/test/');
    expect(executed).toEqual(['middleware', 'handler', 'errorHandler']);
  });
});

describe('createApp 2-phase initialization', () => {
  type TestAppOptions = { http: { controllers: ControllerClass[] } };
  let app: App<TestAppOptions> | undefined;

  afterEach(async () => {
    if (app) {
      await app.shutdown();
      app = undefined;
    }
  });

  it('returns App<{ http: { controllers: unknown[] } }> synchronously without starting lifecycle', () => {
    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    // createApp must return synchronously — no await
    const app = createApp({ http: { controllers: [TestController] } });
    expect(app).toBeDefined();
    expect(typeof app.ready).toBe('function');
    expect(typeof app.fetch).toBe('function');
    expect(typeof app.shutdown).toBe('function');
    expect(typeof app.addFallbackConfig).toBe('function');
  });

  it('throws when fetch called before ready', async () => {
    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    app = createApp({ http: { controllers: [TestController] } });
    await expect(app.fetch(new Request('https://example.com/test/'))).rejects.toThrow(
      'Cannot fetch() before ready()',
    );
  });

  it('ready() is idempotent', async () => {
    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    const result1 = await app.ready();
    // Second call must not throw and must return same result
    const result2 = await app.ready();
    expect(result1.get).toBeDefined();
    expect(result2.get).toBeDefined();
    await app.shutdown();
  });

  it('throws when ready() called after shutdown', async () => {
    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.shutdown();
    await expect(app.ready()).rejects.toThrow(/after shutdown\(\)/);
  });

  it('shutdown() is idempotent', async () => {
    app = createApp({ http: { controllers: [] } });
    await app.ready();
    await app.shutdown();
    await expect(app.shutdown()).resolves.toBeUndefined();
    // Prevent afterEach from calling shutdown() on disposed instance
    app = undefined;
  });
});

describe('addFallbackConfig', () => {
  it('overrides config via createApp configs', async () => {
    @Config
    class BaseConfig {
      get value() {
        return 'base';
      }
    }

    @Config
    class OverrideConfig extends BaseConfig {
      override get value() {
        return 'overridden';
      }
    }

    @Controller('/test')
    class TestController {
      constructor(private cfg = inject(BaseConfig)) {}

      @Get('/')
      get() {
        return { value: this.cfg.value };
      }
    }

    const app = createApp({
      http: { controllers: [TestController] },
      configs: [OverrideConfig],
    });
    await app.ready();

    const res = await app.request('/test/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'overridden' });
    await app.shutdown();
  });

  it('fallback is used when no user config provided', async () => {
    @Config
    class BaseConfig {
      get value() {
        return 'base';
      }
    }

    @Config
    class FallbackConfig extends BaseConfig {
      override get value() {
        return 'fallback';
      }
    }

    @Controller('/test')
    class TestController {
      constructor(private cfg = inject(BaseConfig)) {}

      @Get('/')
      get() {
        return { value: this.cfg.value };
      }
    }

    const app = createApp({
      http: { controllers: [TestController] },
    });
    app.addFallbackConfig(FallbackConfig);
    await app.ready();

    const res = await app.request('/test/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'fallback' });
    await app.shutdown();
  });

  it('user config wins over fallback', async () => {
    @Config
    class BaseConfig {
      get value() {
        return 'base';
      }
    }

    @Config
    class FallbackConfig extends BaseConfig {
      override get value() {
        return 'fallback';
      }
    }

    @Config
    class UserConfig extends BaseConfig {
      override get value() {
        return 'user';
      }
    }

    @Controller('/test')
    class TestController {
      constructor(private cfg = inject(BaseConfig)) {}

      @Get('/')
      get() {
        return { value: this.cfg.value };
      }
    }

    const app = createApp({
      http: { controllers: [TestController] },
      configs: [UserConfig],
    });
    app.addFallbackConfig(FallbackConfig);
    await app.ready();

    const res = await app.request('/test/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'user' });
    await app.shutdown();
  });

  it('throws when addFallbackConfig called after ready', async () => {
    @Config
    class SomeConfig {}

    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();
    expect(() => app.addFallbackConfig(SomeConfig)).toThrow(/after ready\(\)/);
    await app.shutdown();
  });

  it('throws when addFallbackConfig called after shutdown', async () => {
    @Config
    class SomeConfig2 {}

    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.shutdown();
    expect(() => app.addFallbackConfig(SomeConfig2)).toThrow(/after shutdown\(\)/);
  });
});

describe('warmup option', () => {
  it('lazy mode (default): lifecycle starts on first request', async () => {
    const events: string[] = [];

    @injectable()
    class LazyService {
      constructor(lifecycle = inject(LifecycleManager)) {
        const lc: Lifecycle = {
          startup: async () => {
            events.push('LazyService:startup');
          },
          shutdown: async () => {
            events.push('LazyService:shutdown');
          },
        };
        lifecycle.register(lc);
      }

      getValue() {
        return 'lazy';
      }
    }

    @Controller('/lazy')
    class LazyController {
      constructor(private svc = inject(LazyService)) {}

      @Get('/')
      get() {
        return { value: this.svc.getValue() };
      }
    }

    const app = createApp({ http: { controllers: [LazyController] } });
    await app.ready();

    expect(events).toEqual([]);

    const res = await app.request('/lazy/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'lazy' });

    expect(events).toEqual(['LazyService:startup']);
    await app.shutdown();
  });

  it('warmup: true - lifecycle starts during ready()', async () => {
    const events: string[] = [];

    @injectable()
    class EagerService {
      constructor(lifecycle = inject(LifecycleManager)) {
        const lc: Lifecycle = {
          startup: async () => {
            events.push('EagerService:startup');
          },
          shutdown: async () => {
            events.push('EagerService:shutdown');
          },
        };
        lifecycle.register(lc);
      }

      getValue() {
        return 'eager';
      }
    }

    @Controller('/eager')
    class EagerController {
      constructor(private svc = inject(EagerService)) {}

      @Get('/')
      get() {
        return { value: this.svc.getValue() };
      }
    }

    const app = createApp({ http: { controllers: [EagerController] } });
    await app.ready({ warmup: true });

    expect(events).toEqual(['EagerService:startup']);

    const res = await app.request('/eager/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'eager' });
    await app.shutdown();
  });

  it('controller instance is cached per request', async () => {
    let instantiationCount = 0;

    @Controller('/cached')
    class CachedController {
      constructor() {
        instantiationCount++;
      }

      @Get('/')
      get() {
        return { count: instantiationCount };
      }
    }

    const app = createApp({ http: { controllers: [CachedController] } });
    await app.ready();

    await app.request('/cached/');
    await app.request('/cached/');
    await app.request('/cached/');

    expect(instantiationCount).toBe(1);
    await app.shutdown();
  });

  it('middleware receives options when used with tuple syntax', async () => {
    type RateLimitOptions = { limit: number; windowSec: number };

    @Middleware
    class RateLimitMiddleware {
      async use(c: Context, next: Next, options: RateLimitOptions): Promise<Response | undefined> {
        c.header('X-RateLimit-Limit', String(options.limit));
        c.header('X-RateLimit-Window', String(options.windowSec));
        await next();
        return undefined;
      }
    }

    @Controller('/api')
    class ApiController {
      @UseMiddleware([RateLimitMiddleware, { limit: 100, windowSec: 60 }])
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp({ http: { controllers: [ApiController] } });
    await app.ready();

    const res = await app.request('/api/');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Window')).toBe('60');
    await app.shutdown();
  });
});
