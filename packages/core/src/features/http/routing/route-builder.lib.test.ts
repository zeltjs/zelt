import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../../app';
import { http } from '../http.feature';
import { request } from '../request/injection';
import { Controller } from './controller.decorator';
import { Get, Post } from './http-method.decorator';

import { collectRoutes, joinPath } from './route-builder.lib';

describe('joinPath', () => {
  it.each([
    ['/users', '/:id', '/users/:id'],
    ['/users/', '/:id', '/users/:id'],
    ['/users', ':id', '/users/:id'],
    ['/', '/', '/'],
    ['/users', '', '/users'],
    ['', '/foo', '/foo'],
  ])('joins %s + %s -> %s', (a, b, expected) => {
    expect(joinPath(a, b)).toBe(expected);
  });
});

describe('collectRoutes', () => {
  it('flattens controller routes with full paths', () => {
    @Controller('/users')
    class UserController {
      @Get('/:id')
      show() {}
      @Post('/')
      create() {}
    }

    const routes = collectRoutes([UserController]);
    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({
      method: 'GET',
      fullPath: '/users/:id',
      methodName: 'show',
      controllerClass: UserController,
    });
    expect(routes[1]).toMatchObject({
      method: 'POST',
      fullPath: '/users',
      methodName: 'create',
    });
  });

  it('throws when a controller is missing @Controller', () => {
    class NoDecorator {
      @Get('/')
      list() {}
    }
    expect(() => collectRoutes([NoDecorator])).toThrow(/missing @Controller/);
  });
});

describe('buildRoutes (instanceof Response branch)', () => {
  it('returns a hand-built Response as-is (instanceof Response branch)', async () => {
    @Controller('/passthrough')
    class PassthroughController {
      @Get('/teapot')
      teapot() {
        return new Response('I am a teapot', { status: 418, headers: { 'X-Custom': 'yes' } });
      }
    }

    const app = createApp([http({ controllers: [PassthroughController] })]);
    const readyApp = await app.createRuntime();
    const res = await readyApp.http.fetch(new Request('http://localhost/passthrough/teapot'));
    expect(res.status).toBe(418);
    expect(res.headers.get('X-Custom')).toBe('yes');
    expect(await res.text()).toBe('I am a teapot');
  });
});

describe('parseRequestBody — malformed body handling', () => {
  @Controller('/body')
  class BodyController {
    @Post('/json')
    async json(req = request()) {
      return { received: await req.body() };
    }
  }

  const app = createApp([http({ controllers: [BodyController] })]);
  const ready = app.createRuntime();

  it('returns 400 JSON for malformed JSON', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(
      new Request('http://localhost/body/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json }',
      }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
    const json = (await res.json()) as { code: string; message: string };
    expect(json.code).toBe('BAD_REQUEST');
    expect(json.message).toMatch(/Invalid JSON/);
  });

  it('returns 200 for valid JSON', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(
      new Request('http://localhost/body/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foo: 'bar' }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received?: { foo: string } };
    expect(json.received).toEqual({ foo: 'bar' });
  });
});

describe('route-builder — error path integration', () => {
  @Controller('/err')
  class ErrController {
    @Get('/not-found')
    nf() {
      throw new HTTPException(404, {
        res: Response.json({ code: 'NOT_FOUND', message: 'gone' }, { status: 404 }),
      });
    }

    @Get('/teapot')
    tp() {
      throw new HTTPException(418, {
        res: Response.json({ shape: 'teapot' }, { status: 418 }),
      });
    }
  }

  const app = createApp([http({ controllers: [ErrController] })]);
  const ready = app.createRuntime();

  it('serializes HTTPException to status + custom body via getResponse()', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(new Request('http://localhost/err/not-found'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: 'NOT_FOUND', message: 'gone' });
  });

  it('passes through user-provided res override via getResponse()', async () => {
    const readyApp = await ready;
    const res = await readyApp.http.fetch(new Request('http://localhost/err/teapot'));
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ shape: 'teapot' });
  });
});
