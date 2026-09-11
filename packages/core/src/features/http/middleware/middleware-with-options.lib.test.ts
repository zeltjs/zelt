import { describe, expect, expectTypeOf, it } from 'vitest';
import type { MiddlewareOptionsOf, Next } from './middleware.types';
import { MiddlewareWithOptions } from './middleware-with-options.lib';

type RateLimitOptions = { limit: number; windowSec: number };

class RateLimitMiddleware extends MiddlewareWithOptions<RateLimitOptions> {
  async use(next: Next): Promise<undefined> {
    await next();
    return undefined;
  }
}

class ExtendedRateLimitMiddleware extends RateLimitMiddleware {}

describe('MiddlewareWithOptions.with()', () => {
  it('returns a binding carrying the class and the given options', () => {
    const bound = RateLimitMiddleware.with({ limit: 100, windowSec: 60 });
    expect(bound.middleware).toBe(RateLimitMiddleware);
    expect(bound.options).toEqual({ limit: 100, windowSec: 60 });
  });

  it('produces a distinct identity on every call, even with identical options', () => {
    const first = RateLimitMiddleware.with({ limit: 1, windowSec: 1 });
    const second = RateLimitMiddleware.with({ limit: 1, windowSec: 1 });
    expect(first).not.toBe(second);
  });

  it('resolves the bound class from a one-level subclass', () => {
    const bound = ExtendedRateLimitMiddleware.with({ limit: 1, windowSec: 1 });
    expect(bound.middleware).toBe(ExtendedRateLimitMiddleware);
    expect(bound.options).toEqual({ limit: 1, windowSec: 1 });
  });

  it('preserves the concrete class (not widened to MiddlewareClass) so middlewareOptions()/middlewareValue() can recover it', () => {
    const bound = RateLimitMiddleware.with({ limit: 1, windowSec: 1 });
    expectTypeOf(bound.middleware).toEqualTypeOf<typeof RateLimitMiddleware>();
  });
});

describe('MiddlewareOptionsOf', () => {
  it('extracts the TOptions a subclass was declared with', () => {
    expectTypeOf<
      MiddlewareOptionsOf<typeof RateLimitMiddleware>
    >().toEqualTypeOf<RateLimitOptions>();
  });
});
