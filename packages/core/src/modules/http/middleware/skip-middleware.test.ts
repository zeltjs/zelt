import { describe, expect, it } from 'vitest';
import { Controller } from '../routing/controller';
import { Get } from '../routing/http-method';
import { getSkipMiddlewareMetadata } from '../routing/metadata';
import { Middleware } from './middleware';
import { SkipMiddleware } from './skip-middleware';
import type { Next } from './types';

@Middleware
class AuthMiddleware {
  async use(next: Next) {
    await next();
    return undefined;
  }
}

@Middleware
class LoggingMiddleware {
  async use(next: Next) {
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
