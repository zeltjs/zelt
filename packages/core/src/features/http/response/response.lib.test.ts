import { describe, expect, expectTypeOf, it } from 'vitest';
import { createApp } from '../../../app';
import { http } from '../http.feature';
import { Controller } from '../routing/controller.decorator';
import { Get, Post } from '../routing/http-method.decorator';
import type { HttpReply } from './http-reply.types';
import { response } from './response.lib';

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

  @Get('/header-append')
  headerAppendRoute(res = response()) {
    return res.header('X-Foo', 'one').header('X-Foo', 'two', { type: 'append' }).json({ ok: true });
  }

  @Get('/header-override')
  headerOverrideRoute(res = response()) {
    return res.header('X-Foo', 'one').header('X-Foo', 'two').json({ ok: true });
  }

  @Get('/header-remove')
  headerRemoveRoute(res = response()) {
    return res.header('X-Foo', 'one').removeHeader('X-Foo').json({ ok: true });
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
  const app = createApp([http({ controllers: [ResponseTestController] })]);
  const ready = app.createRuntime();

  it('json status code', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(new Request('http://localhost/r/json'));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('redirect', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(
      new Request('http://localhost/r/redirect', { redirect: 'manual' }),
    );
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/new');
  });

  it('text', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(new Request('http://localhost/r/text'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello');
  });

  it('header chainable', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(new Request('http://localhost/r/header'));
    expect(res.headers.get('x-foo')).toBe('bar');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('header appends when requested', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(new Request('http://localhost/r/header-append'));
    expect(res.headers.get('x-foo')).toBe('one, two');
  });

  it('header overrides by default', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(new Request('http://localhost/r/header-override'));
    expect(res.headers.get('x-foo')).toBe('two');
  });

  it('removes headers', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(new Request('http://localhost/r/header-remove'));
    expect(res.headers.get('x-foo')).toBeNull();
  });

  it('raw return wraps with c.json', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(
      new Request('http://localhost/r/raw', { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ wrapped: true });
  });

  it('builds reply data without an entry context or a native Response', () => {
    const reply = response().json({ ok: true });
    expect(reply).not.toBeInstanceOf(Response);
    expect(reply).toMatchObject({ status: 200, format: 'json', body: { ok: true } });
  });

  it('branches status and headers without changing the original builder or reply', () => {
    const base = response().header('X-Base', 'original');
    const first = base.json({ ok: true });
    const changed = base.status(400).header('X-Base', 'changed').json({ code: 'INVALID' });
    expect(base.json({ ok: true })).toEqual(first);
    expect(first.status).toBe(200);
    expect(changed.status).toBe(400);
    expect(first.headerOperations).toEqual([
      { kind: 'header', name: 'X-Base', value: 'original', append: false },
    ]);
    expect(changed.headerOperations).toHaveLength(2);
  });

  it('retains literal status through header and cookie chaining', () => {
    const reply = response()
      .status(400)
      .header('X-Reason', 'bad')
      .setCookie('seen', 'yes')
      .json({ code: 'INVALID' });
    expectTypeOf(reply).toEqualTypeOf<HttpReply<{ code: string }, 400, 'json'>>();
    expectTypeOf(response().status(307).redirect('/next').status).toEqualTypeOf<307>();
  });

  it('describes bodyless replies explicitly', () => {
    expect(response().status(204).empty()).toMatchObject({
      status: 204,
      format: 'empty',
      body: undefined,
    });
    expect(response().empty(304)).toMatchObject({ status: 304, format: 'empty', body: undefined });
    const checkInvalidBodies = () => {
      // @ts-expect-error Bodyless statuses cannot be used for JSON bodies.
      response().status(204).json({ ok: true });
      // @ts-expect-error A bodyless status cannot override a JSON response status.
      response().json({ ok: true }, 304);
      // @ts-expect-error Redirects require a redirect status.
      response().redirect('/next', 400);
    };
    expectTypeOf(checkInvalidBodies).toBeFunction();
  });

  it('does not execute streaming callbacks while building a reply', () => {
    let called = false;
    const reply = response().stream(async () => {
      called = true;
    });
    expect(reply.format).toBe('stream');
    expect(called).toBe(false);
  });

  it('stream returns chunked response', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(new Request('http://localhost/r/stream'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('chunk1chunk2');
  });

  it('streamText returns text/plain with lines', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(new Request('http://localhost/r/stream-text'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toBe('line1\nline2\n');
  });

  it('sse returns event stream', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(new Request('http://localhost/r/sse'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: message');
    expect(text).toContain('data: hello');
    expect(text).toContain('data: world');
    expect(text).toContain('id: 2');
  });
});
