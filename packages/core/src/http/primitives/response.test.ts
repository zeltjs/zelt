import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createContainer } from '../../di/container';
import { LifecycleManager } from '../../lifecycle';
import { Controller } from '../decorators/controller';
import { Get, Post } from '../decorators/http-method';
import { buildRoutes } from '../internal/route-builder';

import { response } from './response';

@Controller('/r')
class ResponseTestController {
  @Get('/json')
  jsonRoute(res = response()) {
    return res.json({ ok: true }, 201);
  }

  @Get('/redirect')
  redirectRoute(res = response()) {
    return res.redirect('/new', 301);
  }

  @Get('/text')
  textRoute(res = response()) {
    return res.text('hello', 200);
  }

  @Get('/header')
  headerRoute(res = response()) {
    return res.header('X-Foo', 'bar').json({ ok: true });
  }

  @Post('/raw')
  rawRoute() {
    return { wrapped: true };
  }

  @Get('/stream')
  streamRoute(res = response()) {
    return res.stream(async (stream) => {
      await stream.write('chunk1');
      await stream.write('chunk2');
    });
  }

  @Get('/stream-text')
  streamTextRoute(res = response()) {
    return res.streamText(async (stream) => {
      await stream.writeln('line1');
      await stream.writeln('line2');
    });
  }

  @Get('/sse')
  sseRoute(res = response()) {
    return res.sse(async (stream) => {
      await stream.writeSSE({ data: 'hello', event: 'message' });
      await stream.writeSSE({ data: 'world', id: '2' });
    });
  }
}

describe('response()', () => {
  const hono = new Hono({ strict: false });
  const resolver = createContainer();
  const lifecycle = resolver.get(LifecycleManager);
  buildRoutes({
    hono,
    controllers: [ResponseTestController],
    resolver,
    lifecycle,
  });

  it('json status code', async () => {
    const res = await hono.fetch(new Request('http://x/r/json'));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('redirect', async () => {
    const res = await hono.fetch(new Request('http://x/r/redirect', { redirect: 'manual' }));
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/new');
  });

  it('text', async () => {
    const res = await hono.fetch(new Request('http://x/r/text'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello');
  });

  it('header chainable', async () => {
    const res = await hono.fetch(new Request('http://x/r/header'));
    expect(res.headers.get('x-foo')).toBe('bar');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('raw return wraps with c.json', async () => {
    const res = await hono.fetch(new Request('http://x/r/raw', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ wrapped: true });
  });

  it('throws when called outside entry execution', () => {
    expect(() => response()).toThrow(/called outside entry execution/);
  });

  it('stream returns chunked response', async () => {
    const res = await hono.fetch(new Request('http://x/r/stream'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('chunk1chunk2');
  });

  it('streamText returns text/plain with lines', async () => {
    const res = await hono.fetch(new Request('http://x/r/stream-text'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toBe('line1\nline2\n');
  });

  it('sse returns event stream', async () => {
    const res = await hono.fetch(new Request('http://x/r/sse'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: message');
    expect(text).toContain('data: hello');
    expect(text).toContain('data: world');
    expect(text).toContain('id: 2');
  });
});
