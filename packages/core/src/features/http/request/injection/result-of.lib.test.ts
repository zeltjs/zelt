import { describe, expect, expectTypeOf, it } from 'vitest';
import { createApp } from '../../../../app';
import {
  runInContext,
  ZeltContextNotAvailableError,
  ZeltMiddlewareResultUnavailableError,
} from '../../../../kernel';
import { http } from '../../http.feature';
import { MiddlewareWithOptions } from '../../middleware';
import { Middleware } from '../../middleware/middleware.decorator';
import type { Next } from '../../middleware/middleware.types';
import { UseMiddleware } from '../../middleware/use-middleware.decorator';
import { Controller } from '../../routing/controller.decorator';
import { Get } from '../../routing/http-method.decorator';
import type { MiddlewareResultOf } from './result-of.lib';
import { resultOf } from './result-of.lib';

describe('resultOf', () => {
  it('reads the value a middleware passed to next() from the handler', async () => {
    @Middleware
    class GreetingMiddleware {
      async use(next: Next<string>): Promise<Response | undefined> {
        await next('hello');
        return undefined;
      }
    }

    @Controller('/greet')
    @UseMiddleware(GreetingMiddleware)
    class GreetController {
      @Get('/')
      get() {
        return { greeting: resultOf(GreetingMiddleware) };
      }
    }

    const app = createApp([http({ controllers: [GreetController] })]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/greet/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ greeting: 'hello' });
  });

  it("lets a downstream middleware read an upstream middleware's result via resultOf()", async () => {
    const seenByDownstream: number[] = [];

    @Middleware
    class UpstreamMiddleware {
      async use(next: Next<number>): Promise<Response | undefined> {
        await next(42);
        return undefined;
      }
    }

    @Middleware
    class DownstreamMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        seenByDownstream.push(resultOf(UpstreamMiddleware));
        await next();
        return undefined;
      }
    }

    @Controller('/chain')
    class ChainController {
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp([
      http({
        controllers: [ChainController],
        middlewares: [UpstreamMiddleware, DownstreamMiddleware],
      }),
    ]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/chain/');
    expect(res.status).toBe(200);
    expect(seenByDownstream).toEqual([42]);
  });

  it('does not record a result when next() is called with no arguments', async () => {
    @Middleware
    class VoidMiddleware {
      async use(next: Next): Promise<Response | undefined> {
        await next();
        return undefined;
      }
    }

    @Controller('/void')
    @UseMiddleware(VoidMiddleware)
    class VoidController {
      @Get('/')
      get() {
        expect(() => resultOf(VoidMiddleware)).toThrow(ZeltMiddlewareResultUnavailableError);
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [VoidController] })]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/void/');
    expect(res.status).toBe(200);
  });

  it('reads the value a bound (MiddlewareWithOptions) middleware passed to next(), via the shared binding', async () => {
    type AuthOptions = { role: string };

    @Middleware
    class UserAuthMiddleware extends MiddlewareWithOptions<AuthOptions> {
      async use(next: Next<{ id: number; role: string }>): Promise<Response | undefined> {
        await next({ id: 1, role: 'admin' });
        return undefined;
      }
    }

    const adminAuth = UserAuthMiddleware.with({ role: 'admin' });

    @Controller('/admin')
    class AdminController {
      @Get('/')
      get() {
        const admin = resultOf(adminAuth);
        return { id: admin.id, role: admin.role };
      }
    }

    const app = createApp([http({ controllers: [AdminController], middlewares: [adminAuth] })]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/admin/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 1, role: 'admin' });
  });

  it('throws when resultOf() is given a different .with() call than the one applied to the route, even with identical options', async () => {
    type AuthOptions = { role: string };

    @Middleware
    class UserAuthMiddleware extends MiddlewareWithOptions<AuthOptions> {
      async use(next: Next<{ id: number; role: string }>): Promise<Response | undefined> {
        await next({ id: 1, role: 'admin' });
        return undefined;
      }
    }

    const applied = UserAuthMiddleware.with({ role: 'admin' });
    const unapplied = UserAuthMiddleware.with({ role: 'admin' });

    @Controller('/admin-mismatch')
    class AdminController {
      @Get('/')
      get() {
        expect(() => resultOf(unapplied)).toThrow(ZeltMiddlewareResultUnavailableError);
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [AdminController], middlewares: [applied] })]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/admin-mismatch/');
    expect(res.status).toBe(200);
  });

  it('throws a named error with a resolution hint when the middleware has not run for this route', () => {
    @Middleware
    class UnappliedMiddleware {
      async use(next: Next<string>): Promise<Response | undefined> {
        await next('x');
        return undefined;
      }
    }

    runInContext(() => {
      expect(() => resultOf(UnappliedMiddleware)).toThrow(ZeltMiddlewareResultUnavailableError);
      expect(() => resultOf(UnappliedMiddleware)).toThrow(/UnappliedMiddleware/);
      expect(() => resultOf(UnappliedMiddleware)).toThrow(/@UseMiddleware/);
    });
  });

  it('throws ZeltContextNotAvailableError when called outside entry execution', () => {
    @Middleware
    class SomeMiddleware {
      async use(next: Next<string>): Promise<Response | undefined> {
        await next('x');
        return undefined;
      }
    }

    expect(() => resultOf(SomeMiddleware)).toThrow(ZeltContextNotAvailableError);
  });

  it('infers the value type from a middleware exposing Next<T>', () => {
    class _TypedMiddleware {
      async use(next: Next<{ id: number }>): Promise<void> {
        await next({ id: 1 });
      }
    }

    expectTypeOf<MiddlewareResultOf<InstanceType<typeof _TypedMiddleware>>>().toEqualTypeOf<{
      id: number;
    }>();
  });

  it('resolves to never for a middleware using the value-less Next', () => {
    class _VoidMiddleware {
      async use(next: Next): Promise<void> {
        await next();
      }
    }

    expectTypeOf<MiddlewareResultOf<InstanceType<typeof _VoidMiddleware>>>().toBeNever();
  });

  it('treats Next<undefined> as a value contract, not as the value-less Next', () => {
    class _ExplicitUndefinedMiddleware {
      async use(next: Next<undefined>): Promise<void> {
        await next(undefined);
      }
    }

    expectTypeOf<
      MiddlewareResultOf<InstanceType<typeof _ExplicitUndefinedMiddleware>>
    >().toEqualTypeOf<undefined>();
  });

  it('records an explicit undefined passed to next() and exposes it via resultOf()', async () => {
    let readValue: unknown = 'not-read';

    @Middleware
    class ExplicitUndefinedMiddleware {
      async use(next: Next<undefined>): Promise<Response | undefined> {
        await next(undefined);
        return undefined;
      }
    }

    @Controller('/explicit-undefined')
    @UseMiddleware(ExplicitUndefinedMiddleware)
    class ExplicitUndefinedController {
      @Get('/')
      get() {
        readValue = resultOf(ExplicitUndefinedMiddleware);
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [ExplicitUndefinedController] })]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/explicit-undefined/');
    expect(res.status).toBe(200);
    expect(readValue).toBeUndefined();
  });
});
