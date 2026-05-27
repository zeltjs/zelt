import { Container } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { Middleware } from './middleware';
import type { Next } from './types';

describe('@Middleware', () => {
  it('makes class injectable and resolvable by container', () => {
    @Middleware
    class TestMiddleware {
      use(next: Next) {
        return next();
      }
    }

    const container = new Container();
    const instance = container.get(TestMiddleware);
    expect(instance).toBeInstanceOf(TestMiddleware);
    expect(typeof instance.use).toBe('function');
  });

  it('makes class injectable when TC39 context has no metadata', () => {
    class TestMiddleware {
      use(next: Next) {
        return next();
      }
    }
    const ctx = {
      kind: 'class',
      name: 'TestMiddleware',
      addInitializer: () => {},
    } as unknown as ClassDecoratorContext;

    const result = (Middleware as (value: unknown, ctx: ClassDecoratorContext) => unknown)(
      TestMiddleware,
      ctx,
    );

    const container = new Container();
    expect(result).toBeUndefined();
    expect(container.get(TestMiddleware)).toBeInstanceOf(TestMiddleware);
  });

  it('preserves class identity after decoration', () => {
    @Middleware
    class LoggingMiddleware {
      use(next: Next) {
        return next();
      }
    }

    expect(LoggingMiddleware.name).toBe('LoggingMiddleware');
  });
});
