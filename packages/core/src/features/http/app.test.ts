import { injectable } from '@needle-di/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { Config } from '../../built-in-service';
import type { Lifecycle } from '../../kernel';
import { inject, LifecycleManager, runInContext } from '../../kernel';
import { ErrorHandler } from './error/error-handler.decorator';
import { http } from './http.feature';
import { fromHonoMiddleware } from './middleware';
import { Middleware } from './middleware/middleware.decorator';
import type { Next } from './middleware/middleware.types';
import { SecureHeadersMiddleware } from './middleware/secure-headers/secure-headers.middleware';
import { SkipMiddleware } from './middleware/skip-middleware.decorator';
import { UseMiddleware } from './middleware/use-middleware.decorator';
import { registerAfterResponseCallback } from './request';
import { getContext, request, setContext } from './request/injection';
import { response } from './response';
import { Controller } from './routing/controller.decorator';
import { Get, Post } from './routing/http-method.decorator';

const createStandardSchema = <Output>({
  validate,
}: {
  readonly validate: (
    value: unknown,
  ) => StandardSchemaV1.Result<Output> | Promise<StandardSchemaV1.Result<Output>>;
}): StandardSchemaV1<unknown, Output> => {
  const types: StandardSchemaV1.Types<unknown, Output> | undefined = undefined;
  return {
    '~standard': {
      version: 1,
      vendor: 'zelt-test',
      validate,
      types,
    },
  };
};

const passthroughFormSchema = createStandardSchema<unknown>({
  validate: (value) => ({ value }),
});

declare module '@zeltjs/core' {
  interface RequestContextSchema {
    configValue: string;
    requestId: string;
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
  greet(req = request()) {
    return { message: this.greeter.greet(req.pathParam('name')) };
  }
}

@Controller('/echo')
class EchoController {
  @Post('/')
  async create(req = request()) {
    return await req.body();
  }
}

@Controller('/upload')
class UploadController {
  @Post('/')
  async upload(req = request(passthroughFormSchema, { target: 'form' })) {
    const formData = (await req.body()) as Record<string, string | File | (string | File)[]>;
    const description = formData['description'] as string;
    const file = formData['file'] as File;
    return { description, filename: file.name, size: file.size };
  }
}

const buildApp = async () => {
  const app = createApp([
    http({ controllers: [HelloController, EchoController, UploadController] }),
  ]);
  return app.createRuntime();
};

const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createApp() — fetch', () => {
  it('serves a constructor-injected GET endpoint with pathParam', async () => {
    const readyApp = await buildApp();
    const res = await readyApp.http.fetch(new Request('https://example.com/hello/zelt'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, zelt' });
  });

  it('isolates request context when called inside an existing Zelt context', async () => {
    const readyApp = await buildApp();

    const results = await runInContext(async () => {
      const res1 = await readyApp.http.fetch(
        new Request('https://example.com/echo/', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ seq: 1 }),
        }),
      );
      const res2 = await readyApp.http.fetch(
        new Request('https://example.com/echo/', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ seq: 2 }),
        }),
      );
      return [await res1.json(), await res2.json()];
    });

    expect(results).toEqual([{ seq: 1 }, { seq: 2 }]);
  });

  it('isolates request helpers when another request is processed inside a request', async () => {
    let fetchInner: () => Promise<Response>;

    @Controller('/inner-context')
    class InnerContextController {
      @Post('/')
      async get(req = request()) {
        return {
          body: await req.body(),
          requestId: getContext('requestId') ?? null,
          url: req.url(),
        };
      }
    }

    @Controller('/outer-context')
    class OuterContextController {
      @Post('/')
      async get(req = request()) {
        setContext('requestId', 'outer');
        const outerBefore = {
          body: await req.body(),
          requestId: getContext('requestId'),
          url: req.url(),
        };
        const res = await fetchInner();
        const outerAfter = {
          body: await req.body(),
          requestId: getContext('requestId'),
          url: req.url(),
        };
        return { inner: await res.json(), outerAfter, outerBefore };
      }
    }

    const app = createApp([
      http({ controllers: [OuterContextController, InnerContextController] }),
    ]);
    const readyApp = await app.createRuntime();
    fetchInner = () =>
      readyApp.http.fetch(
        new Request('https://example.com/inner-context/', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scope: 'inner' }),
        }),
      );

    const res = await readyApp.http.fetch(
      new Request('https://example.com/outer-context/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: 'outer' }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inner: {
        body: { scope: 'inner' },
        requestId: null,
        url: 'https://example.com/inner-context/',
      },
      outerAfter: {
        body: { scope: 'outer' },
        requestId: 'outer',
        url: 'https://example.com/outer-context/',
      },
      outerBefore: {
        body: { scope: 'outer' },
        requestId: 'outer',
        url: 'https://example.com/outer-context/',
      },
    });
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

  it('throws before createRuntime() when a controller is missing @Controller', () => {
    class NoDecorator {
      @Get('/')
      list() {}
    }
    new NoDecorator();
    expect(() => http({ controllers: [NoDecorator] })).toThrow(/missing @Controller/);
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
    const res = await readyApp.http.request(new Request('https://x/hello/zelt'), {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, zelt' });
  });
});

describe('error paths', () => {
  it('returns 500 when pathParam() asks for a missing parameter', async () => {
    @Controller('/x')
    class BrokenController {
      @Get('/')
      run(req = request()) {
        return { v: req.pathParam('id') };
      }
    }
    const app = createApp([http({ controllers: [BrokenController] })]);
    const readyApp = await app.createRuntime();
    const res = await readyApp.http.fetch(new Request('https://example.com/x/'));
    expect(res.status).toBe(500);
  });
});

describe('middleware', () => {
  it('executes global middleware on all routes', async () => {
    const executed: string[] = [];
    @Middleware
    class TrackMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        executed.push('global');
        await next();
        return undefined;
      }
    }

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
        middlewares: [TrackMiddleware],
      }),
    ]);
    const readyApp = await app.createRuntime();

    await readyApp.http.request('/test/');
    expect(executed).toContain('global');
  });

  it('adapts Hono middleware explicitly through fromHonoMiddleware()', async () => {
    const HeaderMiddleware = fromHonoMiddleware(async (c, next) => {
      c.header('X-Bridge', 'hono');
      await next();
    });

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
        middlewares: [HeaderMiddleware],
      }),
    ]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test/');
    expect(res.headers.get('X-Bridge')).toBe('hono');
    await readyApp.shutdown();
  });

  it('lets global middlewares read the request body before the handler', async () => {
    const seen: unknown[] = [];
    @Middleware
    class CaptureBodyMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        seen.push(await request().body());
        await next();
        return undefined;
      }
    }

    const app = createApp([
      http({ controllers: [EchoController], middlewares: [CaptureBodyMiddleware] }),
    ]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg: 'from-middleware' }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ msg: 'from-middleware' });
    expect(seen).toEqual([{ msg: 'from-middleware' }]);
  });

  it('lets parent middlewares read the body for nested child routes', async () => {
    const seen: unknown[] = [];
    @Middleware
    class CaptureBodyMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        seen.push(await request().body());
        await next();
        return undefined;
      }
    }

    const app = createApp([
      http({
        middlewares: [CaptureBodyMiddleware],
        children: [http({ path: '/v1', controllers: [EchoController] })],
      }),
    ]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.fetch(
      new Request('https://example.com/v1/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg: 'nested' }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ msg: 'nested' });
    expect(seen).toEqual([{ msg: 'nested' }]);
  });

  it('executes middlewares in order: global -> controller -> method', async () => {
    const order: string[] = [];
    @Middleware
    class GlobalMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        order.push('global');
        await next();
        return undefined;
      }
    }
    @Middleware
    class ControllerMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        order.push('controller');
        await next();
        return undefined;
      }
    }
    @Middleware
    class MethodMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        order.push('method');
        await next();
        return undefined;
      }
    }

    @UseMiddleware(ControllerMiddleware)
    @Controller('/test')
    class TestController {
      @UseMiddleware(MethodMiddleware)
      @Get('/')
      get() {
        order.push('handler');
        return { ok: true };
      }
    }

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [GlobalMiddleware],
      }),
    ]);
    const readyApp = await app.createRuntime();

    await readyApp.http.request('/test/');
    expect(order).toEqual(['global', 'controller', 'method', 'handler']);
  });

  it('skips global middleware with @SkipMiddleware', async () => {
    const executed: string[] = [];
    @Middleware
    class AuthMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        executed.push('auth');
        await next();
        return undefined;
      }
    }

    @Controller('/test')
    class TestController {
      @Get('/protected')
      protected() {
        executed.push('protected');
        return { ok: true };
      }

      @SkipMiddleware(AuthMiddleware)
      @Get('/public')
      public() {
        executed.push('public');
        return { ok: true };
      }
    }

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [AuthMiddleware],
      }),
    ]);
    const readyApp = await app.createRuntime();

    executed.length = 0;
    await readyApp.http.request('/test/protected');
    expect(executed).toEqual(['auth', 'protected']);

    executed.length = 0;
    await readyApp.http.request('/test/public');
    expect(executed).toEqual(['public']);
  });

  it('skips global middleware for every controller route with class-level @SkipMiddleware', async () => {
    const executed: string[] = [];
    @Middleware
    class AuthMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        executed.push('auth');
        await next();
        return undefined;
      }
    }

    @SkipMiddleware(AuthMiddleware)
    @Controller('/test')
    class TestController {
      @Get('/one')
      one() {
        executed.push('one');
        return { ok: true };
      }

      @Get('/two')
      two() {
        executed.push('two');
        return { ok: true };
      }
    }

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [AuthMiddleware],
      }),
    ]);
    const readyApp = await app.createRuntime();

    executed.length = 0;
    await readyApp.http.request('/test/one');
    expect(executed).toEqual(['one']);

    executed.length = 0;
    await readyApp.http.request('/test/two');
    expect(executed).toEqual(['two']);
  });

  it('unions class-level and method-level @SkipMiddleware declarations', async () => {
    const executed: string[] = [];
    @Middleware
    class AuthMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        executed.push('auth');
        await next();
        return undefined;
      }
    }
    @Middleware
    class LoggingMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        executed.push('logging');
        await next();
        return undefined;
      }
    }

    @SkipMiddleware(AuthMiddleware)
    @Controller('/test')
    class TestController {
      @Get('/class-only')
      classOnly() {
        executed.push('classOnly');
        return { ok: true };
      }

      @SkipMiddleware(LoggingMiddleware)
      @Get('/public')
      public() {
        executed.push('public');
        return { ok: true };
      }
    }

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [AuthMiddleware, LoggingMiddleware],
      }),
    ]);
    const readyApp = await app.createRuntime();

    executed.length = 0;
    await readyApp.http.request('/test/class-only');
    expect(executed).toEqual(['logging', 'classOnly']);

    executed.length = 0;
    await readyApp.http.request('/test/public');
    expect(executed).toEqual(['public']);
  });

  it('runs method-level @UseMiddleware when the same middleware is skipped at class level', async () => {
    const executed: string[] = [];
    @Middleware
    class TrackingMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        executed.push('tracking');
        await next();
        return undefined;
      }
    }

    @SkipMiddleware(TrackingMiddleware)
    @Controller('/test')
    class TestController {
      @UseMiddleware(TrackingMiddleware)
      @Get('/explicit')
      explicit() {
        executed.push('handler');
        return { ok: true };
      }
    }

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [TrackingMiddleware],
      }),
    ]);
    const readyApp = await app.createRuntime();

    await readyApp.http.request('/test/explicit');
    expect(executed).toEqual(['tracking', 'handler']);
  });

  it('skips method-level @UseMiddleware when the same method also declares @SkipMiddleware', async () => {
    const executed: string[] = [];
    @Middleware
    class TrackingMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        executed.push('tracking');
        await next();
        return undefined;
      }
    }

    @Controller('/test')
    class TestController {
      @SkipMiddleware(TrackingMiddleware)
      @UseMiddleware(TrackingMiddleware)
      @Get('/explicit')
      explicit() {
        executed.push('handler');
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();

    await readyApp.http.request('/test/explicit');
    expect(executed).toEqual(['handler']);
  });

  it('skips built-in security middleware with class-level @SkipMiddleware', async () => {
    @SkipMiddleware(SecureHeadersMiddleware)
    @Controller('/webhooks')
    class WebhookController {
      @Get('/incoming')
      incoming() {
        return { ok: true };
      }
    }

    @Controller('/api')
    class ApiController {
      @Get('/data')
      data() {
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [WebhookController, ApiController] })]);
    const readyApp = await app.createRuntime();

    const skippedRes = await readyApp.http.request('/webhooks/incoming');
    expect(skippedRes.headers.get('X-Content-Type-Options')).toBeNull();

    const defaultRes = await readyApp.http.request('/api/data');
    expect(defaultRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
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

      async use(next: Next): Promise<Response | undefined> {
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
    const readyApp = await app.createRuntime();
    const res = await readyApp.http.request('/test/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'injected-value' });
  });

  it('middleware can set context values accessible in handler via getContext()', async () => {
    @Middleware
    class SetUserMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        setContext('user', { id: 123, name: 'alice' });
        await next();
        return undefined;
      }
    }

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
        middlewares: [SetUserMiddleware],
      }),
    ]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 123, userName: 'alice' });
  });

  it('middleware exception is handled by Koya error handler', async () => {
    @Middleware
    class ThrowingMiddleware {
      use(): Response | undefined {
        throw new Error('middleware error');
      }
    }

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
        middlewares: [ThrowingMiddleware],
      }),
    ]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test/');
    expect(res.status).toBe(500);
  });

  it('middleware can return Response to short-circuit', async () => {
    @Middleware
    class EarlyReturnMiddleware {
      use(): Response {
        return new Response(JSON.stringify({ blocked: true }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

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
        middlewares: [EarlyReturnMiddleware],
      }),
    ]);
    const readyApp = await app.createRuntime();

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
    const readyApp = await app.createRuntime();

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
    const readyApp = await app.createRuntime();

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
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test/');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ handled: true, message: 'test error' });
    expect(order).toEqual(['first', 'second']);
  });

  it('middlewares and errorHandlers work together', async () => {
    const executed: string[] = [];

    @Middleware
    class BeforeMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        executed.push('middleware');
        await next();
        return undefined;
      }
    }

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
        middlewares: [BeforeMiddleware],
        errorHandlers: [TestErrorHandler],
      }),
    ]);
    const readyApp = await app.createRuntime();

    await readyApp.http.request('/test/');
    expect(executed).toEqual(['middleware', 'handler', 'errorHandler']);
  });

  it('starts after-response callbacks after async error handler completion', async () => {
    const events: string[] = [];
    let finishErrorHandler!: () => void;
    let finishMiddleware!: () => void;
    const errorHandlerGate = new Promise<void>((resolve) => {
      finishErrorHandler = resolve;
    });
    const middlewareGate = new Promise<void>((resolve) => {
      finishMiddleware = resolve;
    });

    const AfterMiddleware = fromHonoMiddleware(async (_c, next) => {
      events.push('middleware-before');
      await next();
      events.push('middleware-after-start');
      await middlewareGate;
      events.push('middleware-after-finished');
    });

    @ErrorHandler
    class AsyncErrorHandler {
      async onError(_error: Error, _c: Context) {
        events.push('error-handler-start');
        await errorHandlerGate;
        events.push('error-handler-finished');
        return Response.json({ handled: true }, { status: 500 });
      }
    }

    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        registerAfterResponseCallback(() => {
          events.push('after-response');
        });
        throw new Error('test');
      }
    }

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [AfterMiddleware],
        errorHandlers: [AsyncErrorHandler],
      }),
    ]);
    const readyApp = await app.createRuntime();

    const responsePromise = readyApp.http.request('/test/');
    await vi.waitFor(() => expect(events).toEqual(['middleware-before', 'error-handler-start']));

    expect(events).toEqual(['middleware-before', 'error-handler-start']);

    finishErrorHandler();
    await vi.waitFor(() =>
      expect(events).toEqual([
        'middleware-before',
        'error-handler-start',
        'error-handler-finished',
        'middleware-after-start',
      ]),
    );
    await nextMacrotask();

    expect(events).toEqual([
      'middleware-before',
      'error-handler-start',
      'error-handler-finished',
      'middleware-after-start',
    ]);

    finishMiddleware();
    const response = await responsePromise;
    expect(response.status).toBe(500);
    expect(events).toEqual([
      'middleware-before',
      'error-handler-start',
      'error-handler-finished',
      'middleware-after-start',
      'middleware-after-finished',
    ]);

    await vi.waitFor(() =>
      expect(events).toEqual([
        'middleware-before',
        'error-handler-start',
        'error-handler-finished',
        'middleware-after-start',
        'middleware-after-finished',
        'after-response',
      ]),
    );
  });
});

describe('createApp 2-phase initialization', () => {
  it('returns NewApp synchronously with createRuntime() method', () => {
    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    expect(app).toBeDefined();
    expect(typeof app.createRuntime).toBe('function');
  });

  it('createRuntime() returns RuntimeApp with http capabilities and shutdown', async () => {
    @Controller('/test')
    class TestController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    expect(readyApp.http).toBeDefined();
    expect(typeof readyApp.http.fetch).toBe('function');
    expect(typeof readyApp.http.request).toBe('function');
    expect(typeof readyApp.shutdown).toBe('function');
    expect(typeof readyApp.get).toBe('function');
    await readyApp.shutdown();
  });

  it('shutdown() is idempotent', async () => {
    const app = createApp([http({ controllers: [] })]);
    const readyApp = await app.createRuntime();
    await readyApp.shutdown();
    await expect(readyApp.shutdown()).resolves.toBeUndefined();
  });
});

describe('config override / fallback via createRuntime()', () => {
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

    const app = createApp([http({ controllers: [TestController] })], { configs: [OverrideConfig] });
    const readyApp = await app.createRuntime();

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

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime({ fallbackConfigs: [FallbackConfig] });

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

    const app = createApp([http({ controllers: [TestController] })], { configs: [UserConfig] });
    const readyApp = await app.createRuntime({ fallbackConfigs: [FallbackConfig] });

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
          http({
            path: '/api',
            controllers: [UserController],
          }),
        ],
      }),
    ]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/api/users/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [] });
  });

  it('middlewares accumulate from parent to child', async () => {
    const order: string[] = [];
    @Middleware
    class ParentMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        order.push('parent');
        await next();
        return undefined;
      }
    }
    @Middleware
    class ChildMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        order.push('child');
        await next();
        return undefined;
      }
    }

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
        middlewares: [ParentMiddleware],
        children: [
          http({
            path: '/api',
            controllers: [ChildController],
            middlewares: [ChildMiddleware],
          }),
        ],
      }),
    ]);
    const readyApp = await app.createRuntime();

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
          http({
            path: '/api',
            controllers: [ChildController],
            errorHandlers: [ChildErrorHandler],
          }),
        ],
      }),
    ]);
    const readyApp = await app.createRuntime();

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
          http({
            path: '/api',
            controllers: [ChildController],
          }),
        ],
      }),
    ]);
    const readyApp = await app.createRuntime();

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
          http({
            path: '/api',
            controllers: [BubbleController],
            errorHandlers: [ChildHandler],
          }),
        ],
      }),
    ]);
    const readyApp = await app.createRuntime();

    const childRes = await readyApp.http.request('/api/test/child-error');
    expect(childRes.status).toBe(422);
    expect(await childRes.json()).toEqual({ handler: 'child' });

    const parentRes = await readyApp.http.request('/api/test/parent-error');
    expect(parentRes.status).toBe(400);
    expect(await parentRes.json()).toEqual({ handler: 'parent' });

    const defaultRes = await readyApp.http.request('/api/test/default-error');
    expect(defaultRes.status).toBe(500);
  });

  it('starts child after-response callbacks after parent async error handler completion', async () => {
    const events: string[] = [];
    let finishParentHandler!: () => void;
    const parentHandlerGate = new Promise<void>((resolve) => {
      finishParentHandler = resolve;
    });

    @ErrorHandler
    class ParentHandler {
      async onError(_error: Error, _c: Context) {
        events.push('parent-start');
        await parentHandlerGate;
        events.push('parent-finished');
        return Response.json({ handler: 'parent' }, { status: 400 });
      }
    }

    @ErrorHandler
    class ChildHandler {
      onError(_error: Error, _c: Context) {
        events.push('child-rethrow');
        return undefined;
      }
    }

    @Controller('/test')
    class ChildController {
      @Get('/')
      get() {
        registerAfterResponseCallback(() => {
          events.push('after-response');
        });
        throw new Error('parent-handles');
      }
    }

    const app = createApp([
      http({
        controllers: [],
        errorHandlers: [ParentHandler],
        children: [
          http({
            path: '/api',
            controllers: [ChildController],
            errorHandlers: [ChildHandler],
          }),
        ],
      }),
    ]);
    const readyApp = await app.createRuntime();

    const responsePromise = readyApp.http.request('/api/test/');
    await vi.waitFor(() => expect(events).toEqual(['child-rethrow', 'parent-start']));
    await nextMacrotask();

    expect(events).toEqual(['child-rethrow', 'parent-start']);

    finishParentHandler();
    const response = await responsePromise;
    expect(response.status).toBe(400);
    expect(events).toEqual(['child-rethrow', 'parent-start', 'parent-finished']);

    await vi.waitFor(() =>
      expect(events).toEqual([
        'child-rethrow',
        'parent-start',
        'parent-finished',
        'after-response',
      ]),
    );
  });

  it('starts child handled after-response callbacks after parent middleware post-processing', async () => {
    const events: string[] = [];
    let finishParentMiddleware!: () => void;
    const parentMiddlewareGate = new Promise<void>((resolve) => {
      finishParentMiddleware = resolve;
    });

    const ParentMiddleware = fromHonoMiddleware(async (_c, next) => {
      events.push('parent-before');
      await next();
      events.push('parent-after-start');
      await parentMiddlewareGate;
      events.push('parent-after-finished');
    });

    @ErrorHandler
    class ChildHandler {
      onError(_error: Error, _c: Context) {
        events.push('child-handler');
        return Response.json({ handler: 'child' }, { status: 409 });
      }
    }

    @Controller('/test')
    class ChildController {
      @Get('/')
      get() {
        registerAfterResponseCallback(() => {
          events.push('after-response');
        });
        throw new Error('child-handles');
      }
    }

    const app = createApp([
      http({
        controllers: [],
        middlewares: [ParentMiddleware],
        children: [
          http({
            path: '/api',
            controllers: [ChildController],
            errorHandlers: [ChildHandler],
          }),
        ],
      }),
    ]);
    const readyApp = await app.createRuntime();

    const responsePromise = readyApp.http.request('/api/test/');
    await vi.waitFor(() =>
      expect(events).toEqual(['parent-before', 'child-handler', 'parent-after-start']),
    );
    await nextMacrotask();

    expect(events).toEqual(['parent-before', 'child-handler', 'parent-after-start']);

    finishParentMiddleware();
    const response = await responsePromise;
    expect(response.status).toBe(409);
    expect(events).toEqual([
      'parent-before',
      'child-handler',
      'parent-after-start',
      'parent-after-finished',
    ]);

    await vi.waitFor(() =>
      expect(events).toEqual([
        'parent-before',
        'child-handler',
        'parent-after-start',
        'parent-after-finished',
        'after-response',
      ]),
    );
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
          http({
            path: '/api',
            children: [
              http({
                path: '/v1',
                controllers: [ItemController],
              }),
            ],
          }),
        ],
      }),
    ]);
    const readyApp = await app.createRuntime();

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
          http({
            path: '/child',
            controllers: [ControllerB],
          }),
        ],
      }),
    ]);

    const controllers = app.http.getControllers();
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
          http({
            path: '/api',
            controllers: [MetaController],
          }),
        ],
      }),
    ]);

    const meta = app.http.getMetadata();
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
    const readyApp = await app.createRuntime();

    expect(events).toEqual([]);

    const res = await readyApp.http.request('/lazy/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 'lazy' });

    expect(events).toEqual(['LazyService:startup']);
    await readyApp.shutdown();
  });

  it('warmup: true - lifecycle starts during createRuntime()', async () => {
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
    const readyApp = await app.createRuntime({ warmup: true });

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
    const readyApp = await app.createRuntime();

    await readyApp.http.request('/cached/');
    await readyApp.http.request('/cached/');
    await readyApp.http.request('/cached/');

    expect(instantiationCount).toBe(1);
    await readyApp.shutdown();
  });

  it('middleware receives options', async () => {
    type RateLimitOptions = { limit: number; windowSec: number };

    @Middleware
    class RateLimitMiddleware {
      async use(
        next: Next,
        options: RateLimitOptions,
        res = response(),
      ): Promise<Response | undefined> {
        res.header('X-RateLimit-Limit', String(options.limit));
        res.header('X-RateLimit-Window', String(options.windowSec));
        await next();
        return undefined;
      }
    }

    @Controller('/api')
    class ApiController {
      @UseMiddleware(RateLimitMiddleware, { limit: 100, windowSec: 60 })
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [ApiController] })]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/api/');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Window')).toBe('60');
    await readyApp.shutdown();
  });
});
