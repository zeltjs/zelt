import { describe, expect, it } from 'vitest';
import { Injectable } from '../../../kernel';
import { getControllerMiddlewareMetadata, getMethodMiddlewareMetadata } from '../routing';
import { Controller } from '../routing/controller.decorator';
import { Get } from '../routing/http-method.decorator';
import type { MiddlewareInstance } from './middleware.types';
import { MiddlewareWithOptions } from './middleware-with-options.lib';
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

  it('registers a binding (from .with()) on method metadata, keeping the exact bound object as identity', () => {
    @Injectable()
    class OptionsMiddleware extends MiddlewareWithOptions<{ limit: number }> {
      async use(next: () => Promise<void>) {
        await next();
        return undefined;
      }
    }
    const bound = OptionsMiddleware.with({ limit: 100 });

    @Controller('/test')
    class TestController {
      @UseMiddleware(bound)
      @Get('/')
      handler() {
        return {};
      }
    }

    const meta = getMethodMiddlewareMetadata(TestController);
    expect(meta).toHaveLength(1);
    expect(meta[0]?.methodName).toBe('handler');
    expect(meta[0]?.middlewares[0]).toBe(bound);
  });

  it('registers a binding (from .with()) on controller metadata, keeping the exact bound object as identity', () => {
    @Injectable()
    class OptionsMiddleware extends MiddlewareWithOptions<{ limit: number }> {
      async use(next: () => Promise<void>) {
        await next();
        return undefined;
      }
    }
    const bound = OptionsMiddleware.with({ limit: 50 });

    @UseMiddleware(bound)
    @Controller('/test')
    class TestController {}

    const meta = getControllerMiddlewareMetadata(TestController);
    expect(meta?.[0]?.[0]).toBe(bound);
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

  it('accepts a MiddlewareWithOptions<undefined> subclass bare, without .with()', () => {
    @Injectable()
    class OptionalConfigMiddleware extends MiddlewareWithOptions {
      async use(next: () => Promise<void>) {
        await next();
        return undefined;
      }
    }

    @UseMiddleware(OptionalConfigMiddleware)
    @Controller('/test')
    class TestController {}

    const meta = getControllerMiddlewareMetadata(TestController);
    expect(meta).toEqual([[OptionalConfigMiddleware]]);
  });

  it('rejects registering an options-required middleware without .with() at the type level', () => {
    @Injectable()
    class OptionsMiddleware extends MiddlewareWithOptions<{ limit: number }> {
      async use(next: () => Promise<void>) {
        await next();
        return undefined;
      }
    }

    const registerBare = () => {
      // @ts-expect-error registering the bare class is a type error — there's
      // no options for OptionsMiddleware to run with without .with()
      @UseMiddleware(OptionsMiddleware)
      @Controller('/test')
      class TestController {}
      return TestController;
    };
    void registerBare;
  });
});
