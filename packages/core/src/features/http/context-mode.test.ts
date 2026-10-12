import { describe, expect, it } from 'vitest';
import type { ContextMode, Next, RequestContext } from '../../index';
import {
  Controller,
  captureContext,
  createApp,
  createContextStorage,
  ErrorHandler,
  Get,
  http,
  Middleware,
  MiddlewareWithOptions,
  middlewareOptions,
  middlewareValue,
  Post,
  request,
  response,
  UseMiddleware,
  ZeltContextNotAvailableError,
  ZeltMiddlewareValueUnavailableError,
} from '../../index';

describe.each(['sync', 'async'] as const)('HTTP context mode: %s', (contextMode: ContextMode) => {
  it('does not revive completed storage scopes when middleware post-processing fails', async () => {
    const storage = createContextStorage<string>('test:finished-middleware-scope');
    const failure = new Error('post-processing failed');

    @Middleware
    class Scoped {
      async use(next: Next, req = request()): Promise<undefined> {
        const entry = captureContext();
        await storage.run(req.pathParam('id'), next);
        expect(entry.run(storage.get)).toBeUndefined();
        throw failure;
      }
    }

    @ErrorHandler
    class Errors {
      onError(error: Error, _ctx: RequestContext, req = request(), value = storage.get()) {
        expect(error).toBe(failure);
        return Response.json({ id: req.pathParam('id'), value: value ?? null }, { status: 503 });
      }
    }

    @Controller('/')
    @UseMiddleware(Scoped)
    class Endpoint {
      @Get('/:id')
      async handle(req = request(), value = storage.get()) {
        expect(value).toBe(req.pathParam('id'));
        await Promise.resolve();
        return { value };
      }
    }

    const runtime = await createApp([
      http({ controllers: [Endpoint], errorHandlers: [Errors] }),
    ]).createRuntime({ contextMode });
    try {
      const ids = ['a', 'b', 'c'];
      const results = await Promise.all(ids.map((id) => runtime.http.request(`/${id}`)));
      for (const [index, result] of results.entries()) {
        expect(result.status).toBe(503);
        expect(await result.json()).toEqual({ id: ids[index], value: null });
      }
    } finally {
      await runtime.shutdown();
    }
  });

  it('keeps captured request/value/response handles isolated across overlapping requests', async () => {
    type User = { id: string };
    @Middleware
    class Auth {
      async use(next: Next<User>, req = request()): Promise<undefined> {
        await Promise.resolve();
        await next({ id: req.queryParam('id') ?? '' });
        return undefined;
      }
    }
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'context-contract',
        validate: (value: unknown) => ({ value: { raw: value, userId: middlewareValue(Auth).id } }),
      },
    };
    @Controller('/')
    @UseMiddleware(Auth)
    class Endpoint {
      @Post('/:id')
      async handle(req = request(schema), user = middlewareValue(Auth), res = response()) {
        await Promise.resolve();
        const body = await req.body();
        const raw = await req.bodyRaw();
        res.header('X-Request-Id', user.id);
        return res.json({ id: user.id, path: req.pathParam('id'), body, raw });
      }
    }
    const runtime = await createApp([http({ controllers: [Endpoint] })]).createRuntime({
      contextMode,
    });
    try {
      const responses = await Promise.all(
        Array.from({ length: 100 }, (_, id) =>
          runtime.http.request(`/${id}?id=${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          }),
        ),
      );
      for (const [id, result] of responses.entries()) {
        expect(result.status).toBe(200);
        expect(result.headers.get('X-Request-Id')).toBe(String(id));
        expect(await result.json()).toEqual({
          id: String(id),
          path: String(id),
          body: { raw: { id }, userId: String(id) },
          raw: JSON.stringify({ id }),
        });
      }
    } finally {
      await runtime.shutdown();
    }
  });

  it('keeps distinct bindings and captured options on a shared middleware after next settles', async () => {
    const seen: string[] = [];
    @Middleware
    class Bound extends MiddlewareWithOptions<{ tag: string }> {
      async use(next: Next<string>, opts = middlewareOptions(Bound)): Promise<undefined> {
        await Promise.resolve();
        await next(opts.tag);
        seen.push(opts.tag);
        return undefined;
      }
    }
    const outer = Bound.with({ tag: 'outer' });
    const inner = Bound.with({ tag: 'inner' });
    @Controller('/')
    @UseMiddleware(inner)
    @UseMiddleware(outer)
    class Endpoint {
      @Get('/')
      async handle(a = middlewareValue(outer), b = middlewareValue(inner)) {
        await Promise.resolve();
        return { a, b };
      }
    }
    const runtime = await createApp([http({ controllers: [Endpoint] })]).createRuntime({
      contextMode,
    });
    try {
      const result = await runtime.http.request('/');
      expect(await result.json()).toEqual({ a: 'outer', b: 'inner' });
      expect(seen).toEqual(['inner', 'outer']);
    } finally {
      await runtime.shutdown();
    }
  });

  it('permits ambient reads after await only in async mode and supports explicit capture in both', async () => {
    @Middleware
    class Value {
      async use(next: Next<string>): Promise<undefined> {
        await next('value');
        return undefined;
      }
    }
    @Controller('/')
    @UseMiddleware(Value)
    class Endpoint {
      @Get('/')
      async handle(user = middlewareValue(Value)) {
        const captured = captureContext();
        await Promise.resolve();
        if (contextMode === 'sync') {
          expect(() => middlewareValue(Value)).toThrow(ZeltContextNotAvailableError);
          expect(() => request()).toThrow(ZeltContextNotAvailableError);
        } else {
          expect(middlewareValue(Value)).toBe(user);
          expect(request().path()).toBe('/');
        }
        return { user, captured: captured.run(() => middlewareValue(Value)) };
      }
    }
    const runtime = await createApp([http({ controllers: [Endpoint] })]).createRuntime({
      contextMode,
    });
    try {
      const result = await runtime.http.request('/');
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ user: 'value', captured: 'value' });
    } finally {
      await runtime.shutdown();
    }
  });

  it('isolates nested requests while preserving the outer captured value', async () => {
    let fetchInner: () => Promise<Response>;
    @Middleware
    class OuterValue {
      async use(next: Next<string>): Promise<undefined> {
        await next('outer');
        return undefined;
      }
    }
    @Controller('/')
    class Inner {
      @Get('/')
      async handle(req = request()) {
        expect(() => middlewareValue(OuterValue)).toThrow(ZeltMiddlewareValueUnavailableError);
        await Promise.resolve();
        return { path: req.path() };
      }
    }
    @Controller('/')
    @UseMiddleware(OuterValue)
    class Outer {
      @Get('/')
      async handle(value = middlewareValue(OuterValue), req = request()) {
        const inner = await fetchInner();
        return { value, path: req.path(), inner: await inner.json() };
      }
    }
    const runtime = await createApp([
      http({ name: 'outer', controllers: [Outer] }),
      http({ name: 'inner', controllers: [Inner] }),
    ]).createRuntime({ contextMode });
    fetchInner = () => runtime.inner.request('/');
    try {
      const result = await runtime.outer.request('/');
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ value: 'outer', path: '/', inner: { path: '/' } });
    } finally {
      await runtime.shutdown();
    }
  });

  it('shares upstream values with child routers and re-enters error handlers after await', async () => {
    @Middleware
    class ParentValue {
      async use(next: Next<string>): Promise<undefined> {
        await Promise.resolve();
        await next('parent');
        return undefined;
      }
    }
    @ErrorHandler
    class Errors {
      async onError(
        _error: Error,
        _ctx: RequestContext,
        value = middlewareValue(ParentValue),
        res = response(),
      ) {
        await Promise.resolve();
        res.header('X-Error-Value', value);
        return _ctx.json({ value }, 409);
      }
    }
    @Controller('/')
    class Child {
      @Get('/:id')
      async handle(req = request(), value = middlewareValue(ParentValue)) {
        await Promise.resolve();
        if (req.pathParam('id') === 'fail') throw new Error('expected failure');
        return { id: req.pathParam('id'), value };
      }
    }
    const runtime = await createApp([
      http({
        path: '/api',
        middlewares: [ParentValue],
        errorHandlers: [Errors],
        children: [http({ path: '/child', controllers: [Child] })],
      }),
    ]).createRuntime({ contextMode });
    try {
      const result = await runtime.http.request('/api/child/42');
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ id: '42', value: 'parent' });
      const failure = await runtime.http.request('/api/child/fail');
      expect(failure.status).toBe(409);
      expect(failure.headers.get('X-Error-Value')).toBe('parent');
      expect(await failure.json()).toEqual({ value: 'parent' });
    } finally {
      await runtime.shutdown();
    }
  });
});
