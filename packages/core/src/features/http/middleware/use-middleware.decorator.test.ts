import { describe, expect, it } from 'vitest';
import { Injectable } from '../../../kernel';
import { getControllerMiddlewareMetadata, getMethodMiddlewareMetadata } from '../routing';
import { Controller } from '../routing/controller.decorator';
import { Get } from '../routing/http-method.decorator';
import type { MiddlewareEntry, MiddlewareInstance } from './middleware.types';
import { UseMiddleware } from './use-middleware.decorator';

class TestMiddleware implements MiddlewareInstance {
  async use(next: () => Promise<void>) {
    await next();
    return undefined;
  }
}

class AnotherMiddleware implements MiddlewareInstance {
  async use(next: () => Promise<void>) {
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

  it('keeps each controller middleware application as a separate set', () => {
    @UseMiddleware(TestMiddleware)
    @UseMiddleware(AnotherMiddleware)
    @Controller('/test')
    class TestController {}

    const meta = getControllerMiddlewareMetadata(TestController);
    expect(meta).toEqual([[AnotherMiddleware], [TestMiddleware]]);
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

  it('registers middleware with options on method metadata', () => {
    @Injectable()
    class OptionsMiddleware implements MiddlewareInstance<{ limit: number }> {
      async use(next: () => Promise<void>, _options: { limit: number }) {
        await next();
        return undefined;
      }
    }

    @Controller('/test')
    class TestController {
      @UseMiddleware(OptionsMiddleware, { limit: 100 })
      @Get('/')
      handler() {
        return {};
      }
    }

    const meta = getMethodMiddlewareMetadata(TestController);
    expect(meta).toHaveLength(1);
    expect(meta[0]?.methodName).toBe('handler');
    const entry = meta[0]?.middlewares[0] as MiddlewareEntry<{ limit: number }>;
    expect(entry.middleware).toBe(OptionsMiddleware);
    expect(entry.options).toEqual({ limit: 100 });
  });

  it('registers middleware with options on controller metadata', () => {
    @Injectable()
    class OptionsMiddleware implements MiddlewareInstance<{ limit: number }> {
      async use(next: () => Promise<void>, _options: { limit: number }) {
        await next();
        return undefined;
      }
    }

    @UseMiddleware(OptionsMiddleware, { limit: 50 })
    @Controller('/test')
    class TestController {}

    const meta = getControllerMiddlewareMetadata(TestController);
    const entry = meta?.[0]?.[0] as MiddlewareEntry<{ limit: number }>;
    expect(entry.middleware).toBe(OptionsMiddleware);
    expect(entry.options).toEqual({ limit: 50 });
  });

  it('keeps each @UseMiddleware application as a separate set on the class', () => {
    @UseMiddleware(TestMiddleware)
    @UseMiddleware(AnotherMiddleware)
    @Controller('/test')
    class TestController {}

    const meta = getControllerMiddlewareMetadata(TestController);
    // Innermost decorator is evaluated first, so [anotherMiddleware] comes first.
    expect(meta).toEqual([[AnotherMiddleware], [TestMiddleware]]);
  });
});
