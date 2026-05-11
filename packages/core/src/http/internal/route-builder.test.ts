import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import * as v from 'valibot';

import { Controller } from '../decorators/controller';
import { Get, Post } from '../decorators/http-method';
import { LifecycleManager } from '../../lifecycle';
import { validated } from '../../test-helpers/validated';
import { createContainer } from '../../di/container';

import { collectRoutes, joinPath, buildRoutes } from './route-builder';

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

@Controller('/passthrough')
class PassthroughController {
  @Get('/teapot')
  teapot() {
    return new Response('I am a teapot', { status: 418, headers: { 'X-Custom': 'yes' } });
  }
}

describe('buildRoutes (instanceof Response branch)', () => {
  it('returns a hand-built Response as-is (instanceof Response branch)', async () => {
    const hono = new Hono({ strict: false });
    const resolver = createContainer();
    const lifecycle = resolver.get(LifecycleManager);
    buildRoutes({
      hono,
      controllers: [PassthroughController],
      resolver,
      lifecycle,
    });
    const res = await hono.fetch(new Request('http://x/passthrough/teapot'));
    expect(res.status).toBe(418);
    expect(res.headers.get('X-Custom')).toBe('yes');
    expect(await res.text()).toBe('I am a teapot');
  });
});

const createOnError =
  () =>
  (err: Error): Response => {
    if (err instanceof HTTPException) return err.getResponse();
    return Response.json(
      { code: 'INTERNAL_ERROR', message: 'internal server error' },
      { status: 500 },
    );
  };

describe('route-builder — error path integration', () => {
  const BodySchema = v.object({ name: v.string() });

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

    @Post('/v')
    vHandler(body = validated(BodySchema)) {
      return { name: body.name };
    }
  }

  const hono = new Hono({ strict: false });
  hono.onError(createOnError());
  const resolver = createContainer();
  const lifecycle = resolver.get(LifecycleManager);
  buildRoutes({
    hono,
    controllers: [ErrController],
    resolver,
    lifecycle,
  });

  it('serializes HTTPException to status + custom body via getResponse()', async () => {
    const res = await hono.fetch(new Request('http://x/err/not-found'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: 'NOT_FOUND', message: 'gone' });
  });

  it('passes through user-provided res override via getResponse()', async () => {
    const res = await hono.fetch(new Request('http://x/err/teapot'));
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ shape: 'teapot' });
  });

  it('serializes validation error from validated() to 400 + VALIDATION_FAILED body', async () => {
    const res = await hono.fetch(
      new Request('http://x/err/v', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 123 }),
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string; issues: unknown[] };
    expect(json.code).toBe('VALIDATION_FAILED');
    expect(Array.isArray(json.issues)).toBe(true);
    expect(json.issues.length).toBeGreaterThan(0);
  });
});
