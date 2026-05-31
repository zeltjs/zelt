import { injectable } from '@needle-di/core';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReadyApp } from '../../app';
import { createApp } from '../../app';
import { Config } from '../../built-in-service/config';
import type { Lifecycle } from '../../kernel';
import { LifecycleManager } from '../../kernel';
import { inject } from '../../kernel/di';
import { http } from '../../features/http.feature';
import { ErrorHandler } from './error/error-handler.decorator';
import { Middleware } from './middleware/middleware.decorator';
import { SkipMiddleware } from './middleware/skip-middleware.decorator';
import { UseMiddleware } from './middleware/use-middleware.decorator';
import { body, getContext, pathParam, setContext } from './request/injection';
import { Controller } from './routing/controller.decorator';
import { Get, Post } from './routing/http-method.decorator';

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
    const description = formData['description'] as string;
    const file = formData['file'] as File;
    return { description, filename: file.name, size: file.size };
  }
}

const buildApp = async () => {
  const app = createApp([
    http({ controllers: [HelloController, EchoController, UploadController] }),
  ]);
  return app.ready();
};

describe('createApp() — fetch', () => {
  it('serves a constructor-injected GET endpoint with pathParam', async () => {
    const readyApp = await buildApp();
    const res = await readyApp.http.fetch(new Request('https://example.com/hello/zelt'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, zelt' });
  });

  it('parses JSON body', async () => {
    const readyApp = await buildApp();
    const res = await readyApp.http.fetch(
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
    const readyApp = await buildApp();
    const formData = new FormData();
    formData.append('description', 'test file');
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));

    const res = await readyApp.http.fetch(
      new Request('https://example.com/upload/', {
        method: 'POST',
        body: formData,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ description: 'test file', filename: 'test.txt', size: 11 });
  });

  it('mounts multiple controllers under different base paths', async () => {
    const readyApp = await buildApp();
    const a = await readyApp.http.fetch(new Request('https://example.com/hello/x'));
    const b = await readyApp.http.fetch(
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
    const app = createApp([http({ controllers: [NoDecorator] })]);
    await expect(app.ready()).rejects.toThrow(/missing @Controller/);
  });
});

describe('createApp() — request', () => {
  it('accepts a path string with no init (defaults to GET)', async () => {
    const readyApp = await buildApp();
    const res = await readyApp.http.request('/hello/zelt');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, zelt' });
  });

  it('accepts a path string with init for POST + JSON body', async () => {
    const readyApp = await buildApp();
    const res = await readyApp.http.request('/echo/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msg: 'ok' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ msg: 'ok' });
  });

  it('accepts a raw Request instance', async () => {
    const readyApp = await buildApp();
    const res = await readyApp.http.request(new Request('https://x/hello/zelt'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, zelt' });
  });

  it('ignores init when input is a Request (Request takes precedence)', async () => {
    const readyApp = await buildApp();
    // Request の method は GET、init で POST を指定しても Request 側が優先される
    const res = await readyApp.http.request(new Request('https://x/hello/zelt'), { method: 'POST' });
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
    const app = createApp([http({ controllers: [BrokenController] })]);
    const readyApp = await app.ready();
    const res = await readyApp.http.fetch(new Request('https://example.com/x/'));
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

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [trackMiddleware],
      }),
    ]);
    const readyApp = await app.ready();

    await readyApp.http.request('/test/');
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

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [globalMiddleware],
      }),
    ]);
    const readyApp = await app.ready();

    await readyApp.http.request('/test/');
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

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [authMiddleware],
      }),
    ]);
    const readyApp = await app.ready();

    executed.length = 0;
    await readyApp.http.request('/test/protected');
    expect(executed).toEqual(['auth', 'protected']);

    executed.length = 0;
    await readyApp.http.request('/test/public');
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

      async use(_c: Context, next: Next): Promise<Response | undefined> {
        setContext('configValue', this.config.getValue());
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

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();
    const res = await readyApp.http.request('/test/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'injected-value' });
  });

  it('middleware can set context values accessible in handler via getContext()', async () => {
    const setUserMiddleware: MiddlewareHandler = async (_c, next) => {
      setContext('user', { id: 123, name: 'alice' });
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

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [setUserMiddleware],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/test/');
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

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [throwingMiddleware],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/test/');
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

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [earlyReturnMiddleware],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/test/');
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

    const app = createApp([
      http({
        controllers: [TestController],
        errorHandlers: [CustomErrorHandler],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/test/');
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

    const app = createApp([
      http({
        controllers: [TestController],
        errorHandlers: [SelectiveErrorHandler],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/test/');
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

    const app = createApp([
      http({
        controllers: [TestController],
        errorHandlers: [FirstErrorHandler, SecondErrorHandler],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/test/');
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

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [beforeMiddleware],
        errorHandlers: [TestErrorHandler],
      }),
    ]);
    const readyApp = await app.ready();

    await readyApp.http.request('/test/');
    expect(executed).toEqual(['middleware', 'handler', 'errorHandler']);
  });
});

describe('createApp 2-phase initialization', () => {
  it('returns NewApp synchronously with ready() method', () => {
    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    expect(app).toBeDefined();
    expect(typeof app.ready).toBe('function');
  });

  it('ready() returns ReadyApp with http capabilities and shutdown', async () => {
    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();
    expect(readyApp.http).toBeDefined();
    expect(typeof readyApp.http.fetch).toBe('function');
    expect(typeof readyApp.http.request).toBe('function');
    expect(typeof readyApp.shutdown).toBe('function');
    expect(typeof readyApp.get).toBe('function');
    await readyApp.shutdown();
  });

  it('shutdown() is idempotent', async () => {
    const app = createApp([http({ controllers: [] })]);
    const readyApp = await app.ready();
    await readyApp.shutdown();
    await expect(readyApp.shutdown()).resolves.toBeUndefined();
  });
});

describe('config override / fallback via ready()', () => {
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

    const app = createApp([
      http({ controllers: [TestController] }),
    ], { configs: [OverrideConfig] });
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/test/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'overridden' });
    await readyApp.shutdown();
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

    const app = createApp([
      http({ controllers: [TestController] }),
    ]);
    const readyApp = await app.ready({ fallbackConfigs: [FallbackConfig] });

    const res = await readyApp.http.request('/test/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'fallback' });
    await readyApp.shutdown();
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

    const app = createApp([
      http({ controllers: [TestController] }),
    ], { configs: [UserConfig] });
    const readyApp = await app.ready({ fallbackConfigs: [FallbackConfig] });

    const res = await readyApp.http.request('/test/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'user' });
    await readyApp.shutdown();
  });
});

describe('nested children', () => {
  it('child routes are accessible at prefixed paths', async () => {
    @Controller('/users')
    class UserController {
      @Get('/')
      list() {
        return { users: [] };
      }
    }

    const app = createApp([
      http({
        controllers: [],
        children: [
          {
            path: '/api',
            controllers: [UserController],
          },
        ],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/api/users/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [] });
  });

  it('middlewares accumulate from parent to child', async () => {
    const order: string[] = [];
    const parentMiddleware: MiddlewareHandler = async (_c, next) => {
      order.push('parent');
      await next();
    };
    const childMiddleware: MiddlewareHandler = async (_c, next) => {
      order.push('child');
      await next();
    };

    @Controller('/test')
    class ChildController {
      @Get('/')
      get() {
        order.push('handler');
        return { ok: true };
      }
    }

    const app = createApp([
      http({
        controllers: [],
        middlewares: [parentMiddleware],
        children: [
          {
            path: '/api',
            controllers: [ChildController],
            middlewares: [childMiddleware],
          },
        ],
      }),
    ]);
    const readyApp = await app.ready();

    await readyApp.http.request('/api/test/');
    expect(order).toEqual(['parent', 'child', 'handler']);
  });

  it('error handlers are scoped per child level', async () => {
    @ErrorHandler
    class ChildErrorHandler {
      onError(error: Error, _c: Context) {
        return Response.json({ scope: 'child', message: error.message }, { status: 400 });
      }
    }

    @Controller('/test')
    class ChildController {
      @Get('/')
      get() {
        throw new Error('child error');
      }
    }

    const app = createApp([
      http({
        controllers: [],
        children: [
          {
            path: '/api',
            controllers: [ChildController],
            errorHandlers: [ChildErrorHandler],
          },
        ],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/api/test/');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ scope: 'child', message: 'child error' });
  });

  it('parent error handler applies when child has no handler', async () => {
    @ErrorHandler
    class ParentErrorHandler {
      onError(error: Error, _c: Context) {
        return Response.json({ handler: 'parent', message: error.message }, { status: 502 });
      }
    }

    @Controller('/test')
    class ChildController {
      @Get('/')
      get() {
        throw new Error('child error');
      }
    }

    const app = createApp([
      http({
        controllers: [],
        errorHandlers: [ParentErrorHandler],
        children: [
          {
            path: '/api',
            controllers: [ChildController],
          },
        ],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/api/test/');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ handler: 'parent', message: 'child error' });
  });

  it('error handlers bubble child -> parent -> default', async () => {
    @ErrorHandler
    class ParentHandler {
      onError(error: Error, _c: Context) {
        if (error.message === 'parent-handles') {
          return Response.json({ handler: 'parent' }, { status: 400 });
        }
        return undefined;
      }
    }

    @ErrorHandler
    class ChildHandler {
      onError(error: Error, _c: Context) {
        if (error.message === 'child-handles') {
          return Response.json({ handler: 'child' }, { status: 422 });
        }
        return undefined;
      }
    }

    @Controller('/test')
    class BubbleController {
      @Get('/child-error')
      childError() {
        throw new Error('child-handles');
      }

      @Get('/parent-error')
      parentError() {
        throw new Error('parent-handles');
      }

      @Get('/default-error')
      defaultError() {
        throw new Error('unhandled');
      }
    }

    const app = createApp([
      http({
        controllers: [],
        errorHandlers: [ParentHandler],
        children: [
          {
            path: '/api',
            controllers: [BubbleController],
            errorHandlers: [ChildHandler],
          },
        ],
      }),
    ]);
    const readyApp = await app.ready();

    const childRes = await readyApp.http.request('/api/test/child-error');
    expect(childRes.status).toBe(422);
    expect(await childRes.json()).toEqual({ handler: 'child' });

    const parentRes = await readyApp.http.request('/api/test/parent-error');
    expect(parentRes.status).toBe(400);
    expect(await parentRes.json()).toEqual({ handler: 'parent' });

    const defaultRes = await readyApp.http.request('/api/test/default-error');
    expect(defaultRes.status).toBe(500);
  });

  it('multi-level nesting works (3 levels)', async () => {
    @Controller('/items')
    class ItemController {
      @Get('/')
      list() {
        return { items: ['a', 'b'] };
      }
    }

    const app = createApp([
      http({
        controllers: [],
        children: [
          {
            path: '/api',
            children: [
              {
                path: '/v1',
                controllers: [ItemController],
              },
            ],
          },
        ],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/api/v1/items/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: ['a', 'b'] });
  });

  it('getControllers() returns flattened array including children', async () => {
    @Controller('/a')
    class ControllerA {
      @Get('/')
      get() {
        return {};
      }
    }

    @Controller('/b')
    class ControllerB {
      @Get('/')
      get() {
        return {};
      }
    }

    const app = createApp([
      http({
        controllers: [ControllerA],
        children: [
          {
            path: '/child',
            controllers: [ControllerB],
          },
        ],
      }),
    ]);
    const readyApp = await app.ready();

    const controllers = readyApp.http.getControllers();
    expect(controllers).toContain(ControllerA);
    expect(controllers).toContain(ControllerB);
    expect(controllers).toHaveLength(2);
  });

  it('getMetadata() returns prefix-joined paths for children', async () => {
    @Controller('/items')
    class MetaController {
      @Get('/:id')
      getById() {
        return {};
      }
    }

    const app = createApp([
      http({
        controllers: [],
        children: [
          {
            path: '/api',
            controllers: [MetaController],
          },
        ],
      }),
    ]);
    const readyApp = await app.ready();

    const meta = readyApp.http.getMetadata();
    expect(meta.controllers).toHaveLength(1);
    expect(meta.controllers[0]?.basePath).toBe('/api/items');
    expect(meta.controllers[0]?.routes[0]?.fullPath).toBe('/api/items/:id');
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

    const app = createApp([http({ controllers: [LazyController] })]);
    const readyApp = await app.ready();

    expect(events).toEqual([]);

    const res = await readyApp.http.request('/lazy/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'lazy' });

    expect(events).toEqual(['LazyService:startup']);
    await readyApp.shutdown();
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

    const app = createApp([http({ controllers: [EagerController] })]);
    const readyApp = await app.ready({ warmup: true });

    expect(events).toEqual(['EagerService:startup']);

    const res = await readyApp.http.request('/eager/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'eager' });
    await readyApp.shutdown();
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

    const app = createApp([http({ controllers: [CachedController] })]);
    const readyApp = await app.ready();

    await readyApp.http.request('/cached/');
    await readyApp.http.request('/cached/');
    await readyApp.http.request('/cached/');

    expect(instantiationCount).toBe(1);
    await readyApp.shutdown();
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

    const app = createApp([http({ controllers: [ApiController] })]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/api/');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Window')).toBe('60');
    await readyApp.shutdown();
  });
});
