import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';

import { Controller } from '../decorators/controller';
import { Get, Post } from '../decorators/http-method';

import { createContainer } from './container';
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
    // legacy decorator は class declaration 時に metadata 確定済 (new() 不要)

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
    buildRoutes(hono, [PassthroughController], createContainer());
    const res = await hono.fetch(new Request('http://x/passthrough/teapot'));
    expect(res.status).toBe(418);
    expect(res.headers.get('X-Custom')).toBe('yes');
    expect(await res.text()).toBe('I am a teapot');
  });
});
