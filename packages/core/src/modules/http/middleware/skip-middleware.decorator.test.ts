import type { MiddlewareHandler } from 'hono';
import { describe, expect, it } from 'vitest';
import { getSkipMiddlewareMetadata } from '../routing';
import { Controller } from '../routing/controller.decorator';
import { Get } from '../routing/http-method.decorator';
import { SkipMiddleware } from './skip-middleware.decorator';

const authMiddleware: MiddlewareHandler = async (_c, next) => next();
const loggingMiddleware: MiddlewareHandler = async (_c, next) => next();

describe('@SkipMiddleware', () => {
  it('registers skipped middlewares on method metadata', () => {
    @Controller('/test')
    class TestController {
      @SkipMiddleware(authMiddleware)
      @Get('/')
      publicHandler() {
        return {};
      }
    }

    const meta = getSkipMiddlewareMetadata(TestController);
    expect(meta).toHaveLength(1);
    expect(meta[0]?.methodName).toBe('publicHandler');
    expect(meta[0]?.skipped).toContain(authMiddleware);
  });

  it('registers multiple skipped middlewares', () => {
    @Controller('/test')
    class TestController {
      @SkipMiddleware(authMiddleware, loggingMiddleware)
      @Get('/')
      handler() {
        return {};
      }
    }

    const meta = getSkipMiddlewareMetadata(TestController);
    expect(meta[0]?.skipped).toHaveLength(2);
    expect(meta[0]?.skipped).toContain(authMiddleware);
    expect(meta[0]?.skipped).toContain(loggingMiddleware);
  });

  it('throws when applied to static method', () => {
    expect(() => {
      @Controller('/test')
      @Controller('/test')
      class TestController {
        @SkipMiddleware(authMiddleware)
        static staticHandler() {
          return {};
        }
      }
      new TestController();
    }).toThrow(/cannot be applied to static methods/);
  });
});
