import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { applyResponseHeaders } from '../response/response-headers.feature';
import { trackGeneratedResponse } from '../response/response-ownership.feature';
import type { HonoMiddleware, Next } from './middleware.types';
import { resolveIsolatedMiddleware } from './middleware-execution.lib';
import { attachSkippedMiddlewares, guardMiddleware } from './middleware-guard.lib';

describe('middleware response isolation boundary', () => {
  it.each([
    true,
    false,
  ])('starts isolation only when middleware executes, skipped=%s', async (skipped) => {
    let calls = 0;
    class Observer {
      async use(next: Next) {
        calls++;
        await next();
        return undefined;
      }
    }
    const app = new Hono();
    app.use(
      guardMiddleware(Observer, resolveIsolatedMiddleware(Observer, { get: (cls) => new cls() })),
    );
    const handler: HonoMiddleware = (ctx) => {
      const response = trackGeneratedResponse(ctx, ctx.json({ ok: true }));
      ctx.res = response;
      applyResponseHeaders(ctx, [['X-Test', 'value']], []);
      expect(ctx.res === response).toBe(skipped);
      return Promise.resolve(ctx.res);
    };
    attachSkippedMiddlewares(handler, {
      classLevel: new Set(skipped ? [Observer] : []),
      methodLevel: new Set(),
    });
    app.get('/', handler);

    expect(await (await app.request('/')).json()).toEqual({ ok: true });
    expect(calls).toBe(skipped ? 0 : 1);
  });
});
