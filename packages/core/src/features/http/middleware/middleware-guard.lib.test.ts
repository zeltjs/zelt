import type { Context } from 'hono';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { CorsMiddleware } from './cors/cors.middleware';
import { attachSkippedMiddlewares, guardMiddleware } from './middleware-guard.lib';
import { SecureHeadersMiddleware } from './secure-headers/secure-headers.middleware';

describe('middleware skip metadata cache', () => {
  it('continues to observe skip Set changes between middleware executions', async () => {
    const skipped = new Set<typeof SecureHeadersMiddleware>();
    const events: string[] = [];
    const app = new Hono();
    app.use(
      guardMiddleware(CorsMiddleware, async (_ctx, next) => {
        events.push('first');
        skipped.add(SecureHeadersMiddleware);
        await next();
      }),
    );
    app.use(
      guardMiddleware(SecureHeadersMiddleware, async (_ctx, next) => {
        events.push('second');
        await next();
      }),
    );
    const handler = (ctx: Context) => ctx.json({ ok: true });
    attachSkippedMiddlewares(handler, { classLevel: new Set(), methodLevel: skipped });
    app.get('/test', handler);

    const res = await app.request('/test');

    expect(await res.json()).toEqual({ ok: true });
    expect(events).toEqual(['first']);
  });

  it('rechecks metadata for a new request to the same route', async () => {
    const skipped = new Set([SecureHeadersMiddleware]);
    let calls = 0;
    const app = new Hono();
    app.use(
      guardMiddleware(SecureHeadersMiddleware, async (_ctx, next) => {
        calls++;
        await next();
      }),
    );
    const handler = (ctx: Context) => ctx.json({ ok: true });
    attachSkippedMiddlewares(handler, { classLevel: new Set(), methodLevel: skipped });
    app.get('/test', handler);

    expect((await app.request('/test')).status).toBe(200);
    expect(calls).toBe(0);
    skipped.clear();
    expect((await app.request('/test')).status).toBe(200);
    expect(calls).toBe(1);
  });
});
