import { describe, expect, it } from 'vitest';
import { Container } from '@needle-di/core';
import type { Context, Next } from 'hono';

import { Middleware } from './middleware';

describe('@Middleware', () => {
  it('makes class injectable and resolvable by container', () => {
    @Middleware
    class TestMiddleware {
      use(_c: Context, next: Next) {
        return next();
      }
    }

    const container = new Container();
    const instance = container.get(TestMiddleware);
    expect(instance).toBeInstanceOf(TestMiddleware);
    expect(typeof instance.use).toBe('function');
  });

  it('preserves class identity after decoration', () => {
    @Middleware
    class LoggingMiddleware {
      use(_c: Context, next: Next) {
        return next();
      }
    }

    expect(LoggingMiddleware.name).toBe('LoggingMiddleware');
  });
});
