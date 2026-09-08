import { describe, expect, expectTypeOf, it } from 'vitest';
import { createApp } from '../../../../app';
import {
  runInContext,
  ZeltContextNotAvailableError,
  ZeltMiddlewareOptionsUnavailableError,
} from '../../../../kernel';
import { http } from '../../http.feature';
import type { MiddlewareOptionsOf } from '../../middleware';
import { MiddlewareWithOptions } from '../../middleware';
import { Middleware } from '../../middleware/middleware.decorator';
import type { Next } from '../../middleware/middleware.types';
import { Controller } from '../../routing/controller.decorator';
import { Get } from '../../routing/http-method.decorator';
import { optionsOf } from './options-of.lib';

type RateLimitOptions = { limit: number; windowSec: number };

describe('optionsOf', () => {
  it('reads the options a middleware was bound with, from inside its own use()', async () => {
    const seen: RateLimitOptions[] = [];

    @Middleware
    class RateLimitMiddleware extends MiddlewareWithOptions<RateLimitOptions> {
      async use(next: Next): Promise<Response | undefined> {
        seen.push(optionsOf(RateLimitMiddleware));
        await next();
        return undefined;
      }
    }

    @Controller('/limited')
    class LimitedController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp([
      http({
        controllers: [LimitedController],
        middlewares: [RateLimitMiddleware.with({ limit: 100, windowSec: 60 })],
      }),
    ]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/limited/');
    expect(res.status).toBe(200);
    expect(seen).toEqual([{ limit: 100, windowSec: 60 }]);
  });

  it('keeps two bindings of the same class isolated per route', async () => {
    const seen: RateLimitOptions[] = [];

    @Middleware
    class RateLimitMiddleware extends MiddlewareWithOptions<RateLimitOptions> {
      async use(next: Next): Promise<Response | undefined> {
        seen.push(optionsOf(RateLimitMiddleware));
        await next();
        return undefined;
      }
    }

    @Controller('/strict')
    class StrictController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    @Controller('/lenient')
    class LenientController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp([
      http({
        controllers: [],
        children: [
          http({
            path: '/strict',
            controllers: [StrictController],
            middlewares: [RateLimitMiddleware.with({ limit: 1, windowSec: 1 })],
          }),
          http({
            path: '/lenient',
            controllers: [LenientController],
            middlewares: [RateLimitMiddleware.with({ limit: 1000, windowSec: 60 })],
          }),
        ],
      }),
    ]);
    const readyApp = await app.createRuntime();

    await readyApp.http.request('/strict/strict/');
    await readyApp.http.request('/lenient/lenient/');

    expect(seen).toEqual([
      { limit: 1, windowSec: 1 },
      { limit: 1000, windowSec: 60 },
    ]);
  });

  it("restores the outer binding's options after a nested binding of the same class finishes", async () => {
    const seenBefore: RateLimitOptions[] = [];
    const seenAfter: RateLimitOptions[] = [];

    @Middleware
    class RateLimitMiddleware extends MiddlewareWithOptions<RateLimitOptions> {
      async use(next: Next): Promise<Response | undefined> {
        seenBefore.push(optionsOf(RateLimitMiddleware));
        await next();
        seenAfter.push(optionsOf(RateLimitMiddleware));
        return undefined;
      }
    }

    @Controller('/inner')
    class InnerController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp([
      http({
        controllers: [],
        middlewares: [RateLimitMiddleware.with({ limit: 10, windowSec: 1 })],
        children: [
          http({
            path: '/inner',
            controllers: [InnerController],
            middlewares: [RateLimitMiddleware.with({ limit: 20, windowSec: 2 })],
          }),
        ],
      }),
    ]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/inner/inner/');
    expect(res.status).toBe(200);

    // outer's own binding must still read its own options after the nested
    // binding of the same class has run and restored the shared map.
    expect(seenBefore).toEqual([
      { limit: 10, windowSec: 1 },
      { limit: 20, windowSec: 2 },
    ]);
    expect(seenAfter).toEqual([
      { limit: 20, windowSec: 2 },
      { limit: 10, windowSec: 1 },
    ]);
  });

  it('throws a named error with a resolution hint when the class was never bound via .with()', () => {
    class UnboundMiddleware extends MiddlewareWithOptions<RateLimitOptions> {
      async use(next: Next): Promise<Response | undefined> {
        await next();
        return undefined;
      }
    }

    runInContext(() => {
      expect(() => optionsOf(UnboundMiddleware)).toThrow(ZeltMiddlewareOptionsUnavailableError);
      expect(() => optionsOf(UnboundMiddleware)).toThrow(/UnboundMiddleware/);
      expect(() => optionsOf(UnboundMiddleware)).toThrow(/\.with\(/);
    });
  });

  it('throws ZeltContextNotAvailableError when called outside entry execution', () => {
    class SomeMiddleware extends MiddlewareWithOptions<RateLimitOptions> {
      async use(next: Next): Promise<Response | undefined> {
        await next();
        return undefined;
      }
    }

    expect(() => optionsOf(SomeMiddleware)).toThrow(ZeltContextNotAvailableError);
  });

  it('supports the self-referencing default-parameter idiom (opts = optionsOf(Self)), unannotated as documented', async () => {
    const seen: RateLimitOptions[] = [];

    @Middleware
    class RateLimitMiddleware extends MiddlewareWithOptions<RateLimitOptions> {
      // No parameter type annotation, matching website/docs/middleware.md
      // exactly. This only type-checks because optionsOf()'s parameter
      // constraint doesn't require use() to exist (see MiddlewareOptionsClass
      // in middleware-with-options.lib.ts) — requiring it here would make TS
      // resolve this very use() signature while checking that constraint,
      // which is circular.
      async use(next: Next, opts = optionsOf(RateLimitMiddleware)): Promise<Response | undefined> {
        seen.push(opts);
        await next();
        return undefined;
      }
    }

    @Controller('/self-ref')
    class SelfRefController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp([
      http({
        controllers: [SelfRefController],
        middlewares: [RateLimitMiddleware.with({ limit: 5, windowSec: 5 })],
      }),
    ]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/self-ref/');
    expect(res.status).toBe(200);
    expect(seen).toEqual([{ limit: 5, windowSec: 5 }]);
  });

  it('infers the options type from the concrete subclass', () => {
    class _RateLimitMiddleware extends MiddlewareWithOptions<RateLimitOptions> {
      async use(next: Next): Promise<Response | undefined> {
        await next();
        return undefined;
      }
    }

    expectTypeOf<
      MiddlewareOptionsOf<typeof _RateLimitMiddleware>
    >().toEqualTypeOf<RateLimitOptions>();
  });
});
