import { describe, expect, it } from 'vitest';
import type { MiddlewareHandler } from 'hono';

import { getControllerMiddlewareMetadata, getMethodMiddlewareMetadata } from '../internal/metadata';
import type { MiddlewareInputWithOptions } from '../middleware/types';

import { Controller } from './controller';
import { Get } from './http-method';
import { Injectable } from './injectable';
import { UseMiddleware } from './use-middleware';

const testMiddleware: MiddlewareHandler = async (_c, next) => next();
const anotherMiddleware: MiddlewareHandler = async (_c, next) => next();

describe('@UseMiddleware', () => {
  it('registers middlewares on controller metadata', () => {
    @UseMiddleware(testMiddleware)
    @Controller('/test')
    class TestController {}

    const meta = getControllerMiddlewareMetadata(TestController);
    expect(meta?.middlewares).toContain(testMiddleware);
  });

  it('registers multiple middlewares on controller', () => {
    @UseMiddleware(testMiddleware, anotherMiddleware)
    @Controller('/test')
    class TestController {}

    const meta = getControllerMiddlewareMetadata(TestController);
    expect(meta?.middlewares).toHaveLength(2);
    expect(meta?.middlewares).toContain(testMiddleware);
    expect(meta?.middlewares).toContain(anotherMiddleware);
  });

  it('appends middlewares on method metadata', () => {
    @Controller('/test')
    class TestController {
      @UseMiddleware(testMiddleware)
      @Get('/')
      handler() {
        return {};
      }
    }

    const meta = getMethodMiddlewareMetadata(TestController);
    expect(meta).toHaveLength(1);
    expect(meta[0]?.methodName).toBe('handler');
    expect(meta[0]?.middlewares).toContain(testMiddleware);
  });

  it('appends multiple method-level middlewares', () => {
    @Controller('/test')
    class TestController {
      @UseMiddleware(testMiddleware)
      @UseMiddleware(anotherMiddleware)
      @Get('/')
      handler() {
        return {};
      }
    }

    const meta = getMethodMiddlewareMetadata(TestController);
    expect(meta).toHaveLength(2);
  });

  it('throws when applied to static method', () => {
    expect(() => {
      @Controller('/test')
      @Controller('/test')
      class TestController {
        @UseMiddleware(testMiddleware)
        static staticHandler() {
          return {};
        }
      }
      new TestController();
    }).toThrow(/cannot be applied to static methods/);
  });

  it('registers middleware with options as tuple on method metadata', () => {
    @Injectable()
    class OptionsMiddleware {
      async use(_c: unknown, next: () => Promise<void>, _options: { limit: number }) {
        await next();
        return undefined;
      }
    }

    @Controller('/test')
    class TestController {
      @UseMiddleware([OptionsMiddleware, { limit: 100 }])
      @Get('/')
      handler() {
        return {};
      }
    }

    const meta = getMethodMiddlewareMetadata(TestController);
    expect(meta).toHaveLength(1);
    expect(meta[0]?.methodName).toBe('handler');
    const entry = meta[0]?.middlewares[0] as MiddlewareInputWithOptions;
    expect(Array.isArray(entry)).toBe(true);
    expect(entry[0]).toBe(OptionsMiddleware);
    expect(entry[1]).toEqual({ limit: 100 });
  });

  it('registers middleware with options as tuple on controller metadata', () => {
    @Injectable()
    class OptionsMiddleware {
      async use(_c: unknown, next: () => Promise<void>, _options: { limit: number }) {
        await next();
        return undefined;
      }
    }

    @UseMiddleware([OptionsMiddleware, { limit: 50 }])
    @Controller('/test')
    class TestController {}

    const meta = getControllerMiddlewareMetadata(TestController);
    const entry = meta?.middlewares[0] as MiddlewareInputWithOptions;
    expect(Array.isArray(entry)).toBe(true);
    expect(entry[0]).toBe(OptionsMiddleware);
    expect(entry[1]).toEqual({ limit: 50 });
  });
});
