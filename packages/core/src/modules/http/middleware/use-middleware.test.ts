import { describe, expect, it } from 'vitest';
import { Injectable } from '../../../kernel/di/injectable';
import { Controller } from '../routing/controller';
import { Get } from '../routing/http-method';
import { getControllerMiddlewareMetadata, getMethodMiddlewareMetadata } from '../routing/metadata';
import { Middleware } from './middleware';
import type { MiddlewareInputWithOptions, Next } from './types';
import { UseMiddleware } from './use-middleware';

@Middleware
class TestMiddleware {
  async use(next: Next) {
    await next();
    return undefined;
  }
}

@Middleware
class AnotherMiddleware {
  async use(next: Next) {
    await next();
    return undefined;
  }
}

describe('@UseMiddleware', () => {
  it('registers middlewares on controller metadata', () => {
    @UseMiddleware(TestMiddleware)
    @Controller('/test')
    class TestController {}

    const meta = getControllerMiddlewareMetadata(TestController);
    expect(meta).toEqual([[TestMiddleware]]);
  });

  it('registers multiple middlewares on controller as a single set', () => {
    @UseMiddleware(TestMiddleware, AnotherMiddleware)
    @Controller('/test')
    class TestController {}

    const meta = getControllerMiddlewareMetadata(TestController);
    expect(meta).toEqual([[TestMiddleware, AnotherMiddleware]]);
  });

  it('appends middlewares on method metadata', () => {
    @Controller('/test')
    class TestController {
      @UseMiddleware(TestMiddleware)
      @Get('/')
      handler() {
        return {};
      }
    }

    const meta = getMethodMiddlewareMetadata(TestController);
    expect(meta).toHaveLength(1);
    expect(meta[0]?.methodName).toBe('handler');
    expect(meta[0]?.middlewares).toContain(TestMiddleware);
  });

  it('appends multiple method-level middlewares', () => {
    @Controller('/test')
    class TestController {
      @UseMiddleware(TestMiddleware)
      @UseMiddleware(AnotherMiddleware)
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
      class TestController {
        @UseMiddleware(TestMiddleware)
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
      async use(next: () => Promise<void>, _options: { limit: number }) {
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
      async use(next: () => Promise<void>, _options: { limit: number }) {
        await next();
        return undefined;
      }
    }

    @UseMiddleware([OptionsMiddleware, { limit: 50 }])
    @Controller('/test')
    class TestController {}

    const meta = getControllerMiddlewareMetadata(TestController);
    const entry = meta?.[0]?.[0] as MiddlewareInputWithOptions;
    expect(Array.isArray(entry)).toBe(true);
    expect(entry[0]).toBe(OptionsMiddleware);
    expect(entry[1]).toEqual({ limit: 50 });
  });

  it('keeps each @UseMiddleware application as a separate set on the class', () => {
    @UseMiddleware(TestMiddleware)
    @UseMiddleware(AnotherMiddleware)
    @Controller('/test')
    class TestController {}

    const meta = getControllerMiddlewareMetadata(TestController);
    // Innermost decorator is evaluated first, so [AnotherMiddleware] comes first.
    expect(meta).toEqual([[AnotherMiddleware], [TestMiddleware]]);
  });
});
