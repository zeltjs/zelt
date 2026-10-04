import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../../app';
import { LifecycleManager, runInContext } from '../../../../kernel';
import { http } from '../../http.feature';
import { fromHonoMiddleware } from '../../middleware';
import { Middleware } from '../../middleware/middleware.decorator';
import { response } from '../../response';
import { buildRoutes } from '../../routing';
import { Controller } from '../../routing/controller.decorator';
import { Get, Post } from '../../routing/http-method.decorator';
import { requestContext } from '..';
import { bodyRaw, getBody, prepareBodySourceForRawAccess, setBodySource } from './body.lib';
import { request } from './request.lib';

const jsonRequest = (payload = '{ "name": "Ada" }'): Request =>
  new Request('http://localhost/body', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

const withBody = <T>(raw: Request, run: () => T | Promise<T>, exposeRaw = false): Promise<T> =>
  runInContext(async () => {
    setBodySource({
      contentType: raw.headers.get('content-type') ?? '',
      request: raw,
    });
    if (exposeRaw) prepareBodySourceForRawAccess();
    return await run();
  });

afterEach(() => vi.restoreAllMocks());

describe('lazy body source', () => {
  it('leaves raw readers untouched when only Zelt body APIs are used', async () => {
    const raw = jsonRequest();
    const originalText = raw.text;
    const originalPrototype: unknown = Object.getPrototypeOf(raw);
    await runInContext(async () => {
      setBodySource({ contentType: 'application/json', request: raw });
      expect(raw.text).toBe(originalText);
      expect(Object.getPrototypeOf(raw)).toBe(originalPrototype);
      expect(await getBody()).toEqual({ type: 'json', val: { name: 'Ada' } });
      expect(await bodyRaw()).toBe('{ "name": "Ada" }');
      expect(await raw.text()).toBe('{ "name": "Ada" }');
    });
  });

  it('preserves the initial multipart content type without raw reader hooks', async () => {
    const form = new FormData();
    form.append('name', 'Ada');
    const raw = new Request('http://localhost/', { method: 'POST', body: form });
    const contentType = raw.headers.get('content-type');
    if (!contentType) throw new Error('Expected a multipart content type');
    const clone = vi.spyOn(Request.prototype, 'clone');
    await runInContext(async () => {
      setBodySource({ contentType, request: raw });
      raw.headers.set('content-type', 'application/json');
      expect(await getBody()).toEqual({ type: 'form', val: { name: 'Ada' } });
      expect(await bodyRaw()).toContain('name="name"');
      expect(clone).toHaveBeenCalledTimes(2);
    });
  });
  it.each(['GET', 'POST'])('does not clone an unread %s request', async (method) => {
    const raw = new Request('http://localhost/body', {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: 'unread' } : {}),
    });
    const clone = vi.spyOn(Request.prototype, 'clone');
    await withBody(raw, async () => {});
    expect(clone).not.toHaveBeenCalled();
    expect(raw.bodyUsed).toBe(false);
  });

  it('does not access body, bodyUsed or signal during registration', async () => {
    const raw = jsonRequest();
    for (const key of ['body', 'bodyUsed', 'signal'] as const) {
      vi.spyOn(raw, key, 'get').mockImplementation(() => {
        throw new Error(`${key} must remain lazy`);
      });
    }
    await withBody(raw, () => {});
  });

  it.each(['zelt-first', 'raw-first'])('preserves JSON and whitespace with %s', async (order) => {
    const rawText = '{ "name": "Ada" }';
    const raw = jsonRequest(rawText);
    await withBody(
      raw,
      async () => {
        if (order === 'raw-first') expect(await raw.text()).toBe(rawText);
        expect(await getBody()).toEqual({ type: 'json', val: { name: 'Ada' } });
        expect(await bodyRaw()).toBe(rawText);
        if (order === 'zelt-first') expect(await raw.text()).toBe(rawText);
        expect(await getBody()).toEqual({ type: 'json', val: { name: 'Ada' } });
        await expect(raw.text()).rejects.toThrow();
      },
      true,
    );
  });

  it.each([
    'json',
    'text',
    'arrayBuffer',
    'blob',
    'bytes',
  ] as const)('preserves the source when raw.%s() consumes it first', async (reader) => {
    const raw = jsonRequest();
    await withBody(
      raw,
      async () => {
        await raw[reader]();
        expect(raw.bodyUsed).toBe(true);
        expect(await getBody()).toEqual({ type: 'json', val: { name: 'Ada' } });
      },
      true,
    );
  });

  it('preserves the source when raw.body is read as a stream first', async () => {
    const raw = jsonRequest();
    await withBody(
      raw,
      async () => {
        const stream = raw.body;
        expect(stream).not.toBeNull();
        if (!stream) throw new Error('Expected a request body');
        expect(await new Response(stream).text()).toBe('{ "name": "Ada" }');
        expect(await getBody()).toEqual({ type: 'json', val: { name: 'Ada' } });
      },
      true,
    );
  });

  it.each([
    'transfer',
    'prototype',
    'frozen',
  ])('preserves JSON with a native %s consumer', async (mode) => {
    const raw = jsonRequest();
    if (mode === 'frozen') Object.freeze(raw);
    await withBody(
      raw,
      async () => {
        const text =
          mode === 'transfer'
            ? await new Request(raw).text()
            : await Request.prototype.text.call(raw);
        expect(text).toBe('{ "name": "Ada" }');
        expect(await getBody()).toEqual({ type: 'json', val: { name: 'Ada' } });
        expect(await bodyRaw()).toBe(text);
      },
      true,
    );
  });

  it('protects an exposed unread body once across multiple middleware boundaries', async () => {
    const raw = jsonRequest();
    const clone = vi.spyOn(Request.prototype, 'clone');
    await withBody(
      raw,
      async () => {
        prepareBodySourceForRawAccess();
        prepareBodySourceForRawAccess();
        expect(clone).toHaveBeenCalledTimes(1);
        expect(raw.bodyUsed).toBe(false);
        expect(await getBody()).toEqual({ type: 'json', val: { name: 'Ada' } });
        expect(clone).toHaveBeenCalledTimes(1);
      },
      true,
    );
  });

  it('does not clone again when JSON is already cached before raw is exposed', async () => {
    const raw = jsonRequest();
    const clone = vi.spyOn(Request.prototype, 'clone');
    await withBody(raw, async () => {
      expect(await bodyRaw()).toBe('{ "name": "Ada" }');
      prepareBodySourceForRawAccess();
      expect(await new Request(raw).json()).toEqual({ name: 'Ada' });
      expect(await getBody()).toEqual({ type: 'json', val: { name: 'Ada' } });
      expect(clone).toHaveBeenCalledTimes(1);
    });
  });

  it.each([
    'form-only',
    'both',
  ])('protects the uncached multipart representation after caching %s', async (mode) => {
    const form = new FormData();
    form.append('name', 'Ada');
    const raw = new Request('http://localhost/', { method: 'POST', body: form });
    const clone = vi.spyOn(Request.prototype, 'clone');
    await withBody(raw, async () => {
      expect(await getBody()).toEqual({ type: 'form', val: { name: 'Ada' } });
      if (mode === 'both') await bodyRaw();
      prepareBodySourceForRawAccess();
      expect(clone).toHaveBeenCalledTimes(2);
      expect((await new Request(raw).formData()).get('name')).toBe('Ada');
      expect(await bodyRaw()).toContain('name="name"');
      expect(await getBody()).toEqual({ type: 'form', val: { name: 'Ada' } });
      expect(clone).toHaveBeenCalledTimes(mode === 'both' ? 2 : 3);
    });
  });

  it('shares the cache across concurrent readers', async () => {
    const raw = jsonRequest();
    const clone = vi.spyOn(Request.prototype, 'clone');
    await withBody(raw, async () => {
      const [a, b, text] = await Promise.all([getBody(), getBody(), bodyRaw()]);
      expect(a).toBe(b);
      expect(a).toEqual({ type: 'json', val: { name: 'Ada' } });
      expect(text).toBe('{ "name": "Ada" }');
      expect(clone).toHaveBeenCalledTimes(1);
      expect(raw.bodyUsed).toBe(false);
    });
  });

  it.each([
    'parsed-first',
    'text-first',
    'raw-first',
  ])('preserves multipart binary files and repeated fields with %s', async (order) => {
    const bytes = new Uint8Array([0, 255, 128, 65]);
    const form = new FormData();
    form.append('file', new File([bytes], 'binary.dat', { type: 'application/octet-stream' }));
    form.append('tags[]', 'a');
    form.append('tags[]', 'b');
    const raw = new Request('http://localhost/body', { method: 'POST', body: form });
    await withBody(
      raw,
      async () => {
        if (order === 'raw-first') {
          const originalForm = await raw.formData();
          expect(originalForm.getAll('tags[]')).toEqual(['a', 'b']);
        }
        const text = order === 'text-first' ? await bodyRaw() : undefined;
        const parsedBody = await getBody();
        expect(parsedBody.type).toBe('form');
        if (parsedBody.type !== 'form') throw new Error('Expected a form body');
        const parsed = parsedBody.val;
        expect(parsed['tags[]']).toEqual(['a', 'b']);
        const file = parsed['file'];
        expect(file).toBeInstanceOf(File);
        if (!(file instanceof File)) throw new Error('Expected a file');
        expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
        expect(file.name).toBe('binary.dat');
        expect(file.type).toBe('application/octet-stream');
        expect(await bodyRaw()).toContain('filename="binary.dat"');
        if (text) expect(await bodyRaw()).toBe(text);
        expect(await getBody()).toBe(parsedBody);
      },
      order === 'raw-first',
    );
  });

  it('preserves a large chunked body without reading it during initialization', async () => {
    const text = 'あ'.repeat(700_000);
    const payload = JSON.stringify({ text });
    const bytes = new TextEncoder().encode(payload);
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + 4096, bytes.length);
        controller.enqueue(bytes.subarray(offset, end));
        offset = end;
      },
    });
    const raw = new Request('http://localhost/body', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    const clone = vi.spyOn(Request.prototype, 'clone');
    await withBody(raw, async () => {
      expect(clone).not.toHaveBeenCalled();
      expect(stream.locked).toBe(false);
      expect(await getBody()).toEqual({ type: 'json', val: { text } });
      expect(await bodyRaw()).toBe(payload);
      expect(await raw.text()).toBe(payload);
      expect(offset).toBe(bytes.length);
    });
  });

  it('keeps malformed JSON errors and cached raw text', async () => {
    await withBody(jsonRequest('{ invalid }'), async () => {
      await expect(getBody()).rejects.toMatchObject({
        status: 400,
        context: { reason: expect.stringContaining('Invalid JSON') },
      });
      expect(await bodyRaw()).toBe('{ invalid }');
    });
  });

  it('keeps native readers unchanged when raw is exposed', async () => {
    const raw = jsonRequest();
    const originalText = raw.text;
    const originalBodyDescriptor = Object.getOwnPropertyDescriptor(raw, 'body');
    await withBody(
      raw,
      async () => {
        expect(raw.text).toBe(originalText);
        expect(await getBody()).toEqual({ type: 'json', val: { name: 'Ada' } });
      },
      true,
    );
    expect(raw.text).toBe(originalText);
    expect(Object.getOwnPropertyDescriptor(raw, 'body')).toEqual(originalBodyDescriptor);
    expect(await raw.text()).toBe('{ "name": "Ada" }');
  });

  it('preserves each active source when contexts share one raw Request', async () => {
    const raw = jsonRequest();
    const originalText = raw.text;
    await withBody(
      raw,
      async () => {
        await withBody(
          raw,
          async () => {
            expect(await raw.json()).toEqual({ name: 'Ada' });
            expect(await getBody()).toEqual({ type: 'json', val: { name: 'Ada' } });
          },
          true,
        );
        expect(await getBody()).toEqual({ type: 'json', val: { name: 'Ada' } });
      },
      true,
    );
    expect(raw.text).toBe(originalText);
  });

  it('leaves native readers unchanged after middleware failure', async () => {
    const raw = jsonRequest();
    const originalText = raw.text;
    await expect(
      withBody(
        raw,
        async () => {
          await getBody();
          throw new Error('handler failed');
        },
        true,
      ),
    ).rejects.toThrow('handler failed');
    expect(raw.text).toBe(originalText);
  });
});

describe('body source injection', () => {
  @Controller('/')
  class UnreadController {
    @Get('/')
    get() {
      expect(request().method()).toBe('GET');
      return response().json({ hello: 'world' });
    }

    @Post('/')
    post() {
      expect(request().method()).toBe('POST');
      return response().json({ hello: 'world' });
    }
  }

  it.each([
    'runtime',
    'bare-routes',
  ])('avoids eager clones in both GET and POST through %s', async (mode) => {
    const hono = new Hono();
    const runtime =
      mode === 'runtime'
        ? await createApp([http({ controllers: [UnreadController] })]).createRuntime()
        : undefined;
    if (!runtime) {
      buildRoutes({
        hono,
        controllers: [UnreadController],
        resolver: { get: (cls) => new cls() },
        lifecycle: new LifecycleManager(),
      });
    }
    const clone = vi.spyOn(Request.prototype, 'clone');
    try {
      for (const method of ['GET', 'POST']) {
        const raw = new Request('http://localhost/', {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(method === 'POST' ? { body: 'unused' } : {}),
        });
        const response = await (runtime ? runtime.http.fetch(raw) : hono.fetch(raw));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ hello: 'world' });
        expect(clone).not.toHaveBeenCalled();
        expect(raw.bodyUsed).toBe(false);
        expect(Object.hasOwn(raw, 'text')).toBe(false);
      }
    } finally {
      await runtime?.shutdown();
    }
  });

  it.each([
    'json',
    'stream',
    'transfer',
  ])('preserves the body when a Zelt middleware consumes public requestContext() via %s', async (reader) => {
    @Middleware
    class DirectContextMiddleware {
      async use(next: () => Promise<void>) {
        const ctx = requestContext();
        const raw = ctx.req.raw;
        expect(requestContext()).toBe(ctx);
        if (reader === 'json') expect(await raw.json()).toEqual({ name: 'Ada' });
        else if (reader === 'stream')
          expect(await new Response(raw.body).text()).toBe('{ "name": "Ada" }');
        else expect(await new Request(raw).json()).toEqual({ name: 'Ada' });
        await next();
        return undefined;
      }
    }
    @Controller('/')
    class DirectBodyController {
      @Post('/')
      async handle() {
        return { parsed: await request().body(), text: await request().bodyRaw() };
      }
    }
    const raw = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ "name": "Ada" }',
    });
    const clone = vi.spyOn(Request.prototype, 'clone');
    const runtime = await createApp([
      http({ controllers: [DirectBodyController], middlewares: [DirectContextMiddleware] }),
    ]).createRuntime();
    try {
      const result = await runtime.http.fetch(raw);
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ parsed: { name: 'Ada' }, text: '{ "name": "Ada" }' });
      expect(clone).toHaveBeenCalledTimes(1);
    } finally {
      await runtime.shutdown();
    }
  });

  it.each([
    'zelt',
    'raw',
    'hono',
    'transfer',
    'prototype',
  ])('shares the body between a %s middleware and controller', async (mode) => {
    let middlewareBody: unknown;
    const middleware = fromHonoMiddleware(async (ctx, next) => {
      if (mode === 'transfer') middlewareBody = await new Request(ctx.req.raw).json();
      else if (mode === 'prototype')
        middlewareBody = await Request.prototype.json.call(ctx.req.raw);
      else if (mode === 'raw') middlewareBody = await ctx.req.raw.json();
      else if (mode === 'hono') middlewareBody = await ctx.req.json();
      else middlewareBody = await request().body();
      await next();
      expect(await request().body()).toEqual(middlewareBody);
    });
    @Controller('/')
    class BodyController {
      @Post('/')
      async handle() {
        expect(requestContext().req.raw).toBe(raw);
        return { parsed: await request().body(), text: await request().bodyRaw() };
      }
    }
    const raw = new Request('http://localhost/', {
      method: 'POST',
      body: '{ "name": "Ada" }',
      headers: { 'Content-Type': 'application/json' },
    });
    const runtime = await createApp([
      http({ controllers: [BodyController], middlewares: [middleware] }),
    ]).createRuntime();
    try {
      const response = await runtime.http.fetch(raw);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        parsed: { name: 'Ada' },
        text: '{ "name": "Ada" }',
      });
      expect(middlewareBody).toEqual({ name: 'Ada' });
    } finally {
      await runtime.shutdown();
    }
  });
});
