import { describe, expect, it } from 'vitest';
import type { MiddlewareHandler } from 'hono';

import { getSkipMiddlewareMetadata } from '../internal/metadata';

import { Controller } from './controller';
import { Get } from './http-method';
import { SkipMiddleware } from './skip-middleware';

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
