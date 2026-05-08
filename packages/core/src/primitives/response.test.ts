import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';

import { Controller } from '../decorators/controller';
import { Get, Post } from '../decorators/http-method';
import { createContainer } from '../internal/container';
import { buildRoutes } from '../internal/route-builder';
import { LifecycleManager } from '../lifecycle';

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
    expect(() => response()).toThrow('zelt: primitive called outside entry execution');
  });
});
