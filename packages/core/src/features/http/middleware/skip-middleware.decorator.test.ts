import { describe, expect, it } from 'vitest';
import { getSkipMiddlewareMetadata } from '../routing';
import { Controller } from '../routing/controller.decorator';
import { Get } from '../routing/http-method.decorator';
import type { MiddlewareInstance } from './middleware.types';
import { SkipMiddleware } from './skip-middleware.decorator';

class AuthMiddleware implements MiddlewareInstance {
  async use(next: () => Promise<void>) {
    await next();
    return undefined;
  }
}

class LoggingMiddleware implements MiddlewareInstance {
  async use(next: () => Promise<void>) {
    await next();
    return undefined;
  }
}

describe('@SkipMiddleware', () => {
  it('registers skipped middlewares on method metadata', () => {
    @Controller('/test')
    class TestController {
      @SkipMiddleware(AuthMiddleware)
      @Get('/')
      publicHandler() {
        return {};
      }
    }

    const meta = getSkipMiddlewareMetadata(TestController);
    expect(meta).toHaveLength(1);
    expect(meta[0]?.methodName).toBe('publicHandler');
    expect(meta[0]?.skipped).toContain(AuthMiddleware);
  });

  it('registers multiple skipped middlewares', () => {
    @Controller('/test')
    class TestController {
      @SkipMiddleware(AuthMiddleware, LoggingMiddleware)
      @Get('/')
      handler() {
        return {};
      }
    }

    const meta = getSkipMiddlewareMetadata(TestController);
    expect(meta[0]?.skipped).toHaveLength(2);
    expect(meta[0]?.skipped).toContain(AuthMiddleware);
    expect(meta[0]?.skipped).toContain(LoggingMiddleware);
  });

  it('throws when applied to static method', () => {
    expect(() => {
      @Controller('/test')
      @Controller('/test')
      class TestController {
        @SkipMiddleware(AuthMiddleware)
        static staticHandler() {
          return {};
        }
      }
      new TestController();
    }).toThrow(/cannot be applied to static methods/);
  });
});
