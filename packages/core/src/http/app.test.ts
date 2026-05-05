import { injectable } from '@needle-di/core';
import type { MiddlewareHandler, Context, Next } from 'hono';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { Controller } from '../decorators/controller';
import { ErrorHandler } from '../decorators/error-handler';
import { Get, Post } from '../decorators/http-method';
import { Middleware } from '../decorators/middleware';
import { SkipMiddleware } from '../decorators/skip-middleware';
import { UseMiddleware } from '../decorators/use-middleware';
import { inject } from '../primitives/inject';
import { getContext } from '../primitives/get-context';
import { pathParam } from '../primitives/path-param';
import { validated } from '../primitives/validated';

import { createHttpApp } from './app';

declare module '@zeltjs/core' {
  interface RequestContextSchema {
    configValue: string;
    user: { id: number; name: string };
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
  create() {
    return validated(v.object({ msg: v.string() }));
  }
}

const buildApp = () => createHttpApp({ controllers: [HelloController, EchoController] });

describe('createHttpApp() — fetch', () => {
  it('serves a constructor-injected GET endpoint with pathParam', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('https://example.com/hello/zelt'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, zelt' });
  });

  it('parses JSON body via validated()', async () => {
    const app = buildApp();
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

  it('mounts multiple controllers under different base paths', async () => {
    const app = buildApp();
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

  it('throws at createHttpApp() construction when a controller is missing @Controller', () => {
    class NoDecorator {
      @Get('/')
      list() {}
    }
    new NoDecorator();
    expect(() => createHttpApp({ controllers: [NoDecorator] })).toThrow(/missing @Controller/);
  });
});

describe('createHttpApp() — request', () => {
  it('accepts a path string with no init (defaults to GET)', async () => {
    const app = buildApp();
    const res = await app.request('/hello/zelt');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, zelt' });
  });

  it('accepts a path string with init for POST + JSON body', async () => {
    const app = buildApp();
    const res = await app.request('/echo/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msg: 'ok' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ msg: 'ok' });
  });

  it('accepts a raw Request instance', async () => {
    const app = buildApp();
    const res = await app.request(new Request('https://x/hello/zelt'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, zelt' });
  });

  it('ignores init when input is a Request (Request takes precedence)', async () => {
    const app = buildApp();
    // Request の method は GET、init で POST を指定しても Request 側が優先される
    const res = await app.request(new Request('https://x/hello/zelt'), { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, zelt' });
  });
});

describe('error paths', () => {
  it('returns 400 when validated() rejects the body', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg: 42 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed JSON body (validated() sees undefined)', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 when pathParam() asks for a missing parameter', async () => {
    @Controller('/x')
    class BrokenController {
      @Get('/')
      run() {
        return { v: pathParam('id') };
      }
    }
    const app = createHttpApp({ controllers: [BrokenController] });
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

    const app = createHttpApp({
      controllers: [TestController],
      middlewares: [trackMiddleware],
    });

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

    const app = createHttpApp({
      controllers: [TestController],
      middlewares: [globalMiddleware],
    });

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

    const app = createHttpApp({
      controllers: [TestController],
      middlewares: [authMiddleware],
    });

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

    const app = createHttpApp({ controllers: [TestController] });
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
        const user = getContext('user');
        return { userId: user?.id, userName: user?.name };
      }
    }

    const app = createHttpApp({
      controllers: [TestController],
      middlewares: [setUserMiddleware],
    });

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

    const app = createHttpApp({
      controllers: [TestController],
      middlewares: [throwingMiddleware],
    });

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

    const app = createHttpApp({
      controllers: [TestController],
      middlewares: [earlyReturnMiddleware],
    });

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

    const app = createHttpApp({
      controllers: [TestController],
      errorHandlers: [CustomErrorHandler],
    });

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

    const app = createHttpApp({
      controllers: [TestController],
      errorHandlers: [SelectiveErrorHandler],
    });

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

    const app = createHttpApp({
      controllers: [TestController],
      errorHandlers: [FirstErrorHandler, SecondErrorHandler],
    });

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

    const app = createHttpApp({
      controllers: [TestController],
      middlewares: [beforeMiddleware],
      errorHandlers: [TestErrorHandler],
    });

    await app.request('/test/');
    expect(executed).toEqual(['middleware', 'handler', 'errorHandler']);
  });
});
