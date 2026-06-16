import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../../app';
import type { ResolverHandle } from '../../../kernel';
import { LifecycleManager } from '../../../kernel';
import { http } from '../http.feature';
import { body, validateBodyAsync } from '../request/injection';
import { Controller } from './controller.decorator';
import { Get, Post } from './http-method.decorator';

import { buildRoutes, collectRoutes, joinPath } from './route-builder.lib';

type SchemaConfig<Output> = {
  readonly validate: (
    value: unknown,
  ) => StandardSchemaV1.Result<Output> | Promise<StandardSchemaV1.Result<Output>>;
};

const createStandardSchema = <Output>({
  validate,
}: SchemaConfig<Output>): StandardSchemaV1<unknown, Output> => ({
  '~standard': {
    version: 1,
    vendor: 'zelt-test',
    validate,
    types: undefined as StandardSchemaV1.Types<unknown, Output> | undefined,
  },
});

const createResolver = (): ResolverHandle => {
  const instances = new Map<object, object>();
  return {
    get: <T extends object>(cls: new (...args: never[]) => T): T => {
      const cached = instances.get(cls);
      if (cached) return cached as T;
      const instance = Reflect.construct(cls, []) as T;
      instances.set(cls, instance);
      return instance;
    },
  };
};

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

describe('buildRoutes invocation hooks', () => {
  it('passes hook params to the controller without evaluating body default parameters', async () => {
    const defaultBody = (): unknown => {
      throw new Error('body() default parameter should not run when an invocation hook is present');
    };

    @Controller('/hooked')
    class HookedController {
      @Post('/create')
      create(data = defaultBody()) {
        return data;
      }
    }

    const hono = new Hono({ strict: false });
    const contexts: unknown[] = [];
    buildRoutes({
      hono,
      controllers: [HookedController],
      resolver: createResolver(),
      lifecycle: new LifecycleManager(),
      invocationHooks: {
        'POST /hooked/create HookedController.create': async (ctx) => {
          contexts.push({
            controllerClass: ctx.controllerClass,
            methodName: ctx.methodName,
            fullPath: ctx.route.fullPath,
          });
          return [{ name: 'from-hook' }];
        },
      },
    });

    const res = await hono.fetch(
      new Request('http://localhost/hooked/create', {
        method: 'POST',
        body: JSON.stringify({ name: 'from-body' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'from-hook' });
    expect(contexts).toEqual([
      {
        controllerClass: HookedController,
        methodName: 'create',
        fullPath: '/hooked/create',
      },
    ]);
  });

  it('uses the default parameter path when no hook exists for the route', async () => {
    @Controller('/fallback')
    class FallbackController {
      @Post('/create')
      create(data = body() as { name: string }) {
        return { name: data.name };
      }
    }

    const hono = new Hono({ strict: false });
    buildRoutes({
      hono,
      controllers: [FallbackController],
      resolver: createResolver(),
      lifecycle: new LifecycleManager(),
      invocationHooks: {},
    });

    const res = await hono.fetch(
      new Request('http://localhost/fallback/create', {
        method: 'POST',
        body: JSON.stringify({ name: 'from-default' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'from-default' });
  });

  it('awaits async Standard Schema validation through the hook helper', async () => {
    const asyncSchema = createStandardSchema<{ name: string }>({
      validate: async (value) => {
        if (typeof value === 'object' && value !== null && 'name' in value) {
          return { value: { name: String(value.name) } };
        }
        return { issues: [{ message: 'Invalid payload' }] };
      },
    });

    @Controller('/validated-hook')
    class ValidatedHookController {
      @Post('/create')
      create(data: { name: string }) {
        return { receivedName: data.name };
      }
    }

    const hono = new Hono({ strict: false });
    buildRoutes({
      hono,
      controllers: [ValidatedHookController],
      resolver: createResolver(),
      lifecycle: new LifecycleManager(),
      invocationHooks: {
        'POST /validated-hook/create ValidatedHookController.create': async () => [
          await validateBodyAsync(asyncSchema),
        ],
      },
    });

    const res = await hono.fetch(
      new Request('http://localhost/validated-hook/create', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ receivedName: 'Ada' });
  });

  it('uses route identity so same named controller methods on different paths can be hooked independently', async () => {
    const FirstController = (() => {
      @Controller('/first')
      class DuplicateController {
        @Post('/create')
        create(data = body() as { name: string }) {
          return { route: 'first', name: data.name };
        }
      }
      return DuplicateController;
    })();
    const SecondController = (() => {
      @Controller('/second')
      class DuplicateController {
        @Post('/create')
        create(data = body() as { name: string }) {
          return { route: 'second', name: data.name };
        }
      }
      return DuplicateController;
    })();

    const hono = new Hono({ strict: false });
    buildRoutes({
      hono,
      controllers: [FirstController, SecondController],
      resolver: createResolver(),
      lifecycle: new LifecycleManager(),
      invocationHooks: {
        'POST /second/create DuplicateController.create': async () => [{ name: 'from-hook' }],
      },
    });

    const first = await hono.fetch(
      new Request('http://localhost/first/create', {
        method: 'POST',
        body: JSON.stringify({ name: 'from-body' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const second = await hono.fetch(
      new Request('http://localhost/second/create', {
        method: 'POST',
        body: JSON.stringify({ name: 'from-body' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(await first.json()).toEqual({ route: 'first', name: 'from-body' });
    expect(await second.json()).toEqual({ route: 'second', name: 'from-hook' });
  });

  it('throws during build when invocation hook keys collide across routes', () => {
    @Controller('/duplicate')
    class DuplicateRouteController {
      @Post('/create')
      create() {
        return {};
      }
    }

    const hono = new Hono({ strict: false });
    expect(() =>
      buildRoutes({
        hono,
        controllers: [DuplicateRouteController, DuplicateRouteController],
        resolver: createResolver(),
        lifecycle: new LifecycleManager(),
        invocationHooks: {},
      }),
    ).toThrow(
      'Duplicate HTTP invocation hook key "POST /duplicate/create DuplicateRouteController.create"',
    );
  });

  it('rejects undefined hook params before controller default parameters run', async () => {
    let defaultRan = false;
    const defaultBody = (): unknown => {
      defaultRan = true;
      throw new Error('default parameter should not run');
    };

    @Controller('/undefined-param')
    class UndefinedParamController {
      @Post('/create')
      create(data = defaultBody()) {
        return data;
      }
    }

    const hono = new Hono({ strict: false });
    hono.onError((err) => Response.json({ message: err.message }, { status: 500 }));
    buildRoutes({
      hono,
      controllers: [UndefinedParamController],
      resolver: createResolver(),
      lifecycle: new LifecycleManager(),
      invocationHooks: {
        'POST /undefined-param/create UndefinedParamController.create': async () => [undefined],
      },
    });

    const res = await hono.fetch(
      new Request('http://localhost/undefined-param/create', {
        method: 'POST',
        body: JSON.stringify({ name: 'from-body' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(res.status).toBe(500);
    expect(defaultRan).toBe(false);
    expect(await res.json()).toEqual({
      message:
        'HTTP invocation hook "POST /undefined-param/create UndefinedParamController.create" returned undefined parameter at index 0; generated hooks must omit unsupported params or return a defined value.',
    });
  });
});

describe('parseRequestBody — malformed body handling', () => {
  @Controller('/body')
  class BodyController {
    @Post('/json')
    json() {
      return { received: body() };
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
