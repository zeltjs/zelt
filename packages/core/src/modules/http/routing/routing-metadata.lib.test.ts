import { describe, expect, it } from 'vitest';

import { Authorized } from '../middleware/auth/authorized.decorator';
import { SkipMiddleware } from '../middleware/skip-middleware.decorator';
import { UseMiddleware } from '../middleware/use-middleware.decorator';
import { Controller } from './controller.decorator';
import { Get, Post } from './http-method.decorator';

import {
  getAuthorizedMetadata,
  getControllerMetadata,
  getControllerMiddlewareMetadata,
  getMethodMiddlewareMetadata,
  getRouteMetadata,
  getSkipMiddlewareMetadata,
} from './routing-metadata.lib';

describe('metadata collectors (via decorators)', () => {
  it('stores controller metadata per class', () => {
    @Controller('/users')
    class A {}

    @Controller('/posts')
    class B {}

    expect(getControllerMetadata(A)?.basePath).toBe('/users');
    expect(getControllerMetadata(B)?.basePath).toBe('/posts');
  });

  it('returns undefined for class without @Controller', () => {
    class C {}
    expect(getControllerMetadata(C)).toBeUndefined();
  });

  it('collects route metadata in declaration order', () => {
    @Controller('/d')
    class D {
      @Get('/')
      list(): void {}

      @Post('/')
      create(): void {}
    }

    expect(getRouteMetadata(D)).toEqual([
      { method: 'GET', path: '/', methodName: 'list' },
      { method: 'POST', path: '/', methodName: 'create' },
    ]);
  });

  it('collects controller-level UseMiddleware', () => {
    class MwA {
      async use(): Promise<undefined> {
        return undefined;
      }
    }
    @UseMiddleware(MwA)
    @Controller('/x')
    class X {}

    expect(getControllerMiddlewareMetadata(X)).toEqual([[MwA]]);
  });

  it('collects method-level UseMiddleware', () => {
    class MwA {
      async use(): Promise<undefined> {
        return undefined;
      }
    }
    @Controller('/y')
    class Y {
      @UseMiddleware(MwA)
      @Get('/list')
      list(): void {}
    }

    expect(getMethodMiddlewareMetadata(Y)).toEqual([{ methodName: 'list', middlewares: [MwA] }]);
  });

  it('collects SkipMiddleware metadata', () => {
    class MwA {
      async use(): Promise<undefined> {
        return undefined;
      }
    }
    @Controller('/z')
    class Z {
      @SkipMiddleware(MwA)
      @Get('/free')
      free(): void {}
    }

    expect(getSkipMiddlewareMetadata(Z)).toEqual([{ methodName: 'free', skipped: [MwA] }]);
  });

  it('collects Authorized metadata per method', () => {
    @Controller('/u')
    class U {
      @Authorized(['admin'])
      @Get('/admin')
      adminOnly(): void {}
    }

    expect(getAuthorizedMetadata(U, 'adminOnly')).toEqual({
      methodName: 'adminOnly',
      roles: ['admin'],
    });
    expect(getAuthorizedMetadata(U, 'unknownMethod')).toBeUndefined();
  });

  it('combines multiple class-level decorators (stacked props)', () => {
    class MwA {
      async use(): Promise<undefined> {
        return undefined;
      }
    }
    @UseMiddleware(MwA)
    @Controller('/multi')
    class Multi {}

    expect(getControllerMetadata(Multi)?.basePath).toBe('/multi');
    expect(getControllerMiddlewareMetadata(Multi)).toEqual([[MwA]]);
  });
});
