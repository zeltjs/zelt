import type { Context } from 'hono';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { runInContext, ZeltContextNotAvailableError } from '../../../kernel';

import { CorsMiddleware } from './cors/cors.middleware';
import type { Next } from './middleware.types';
import {
  attachSkippedMiddlewares,
  guardMiddleware,
  resolveMiddleware,
} from './middleware-guard.lib';
import { SecureHeadersMiddleware } from './secure-headers/secure-headers.middleware';

describe('middleware skip metadata cache', () => {
  it('observes metadata attached or replaced between requests', async () => {
    let calls = 0;
    const app = new Hono();
    app.use(
      guardMiddleware(SecureHeadersMiddleware, async (_ctx, next) => {
        calls++;
        await next();
      }),
    );
    const handler = (ctx: Context) => ctx.json({ ok: true });
    app.get('/test', handler);

    expect((await app.request('/test')).status).toBe(200);
    expect(calls).toBe(1);
    attachSkippedMiddlewares(handler, {
      classLevel: new Set([SecureHeadersMiddleware]),
      methodLevel: new Set(),
    });
    expect((await app.request('/test')).status).toBe(200);
    expect(calls).toBe(1);
    attachSkippedMiddlewares(handler, { classLevel: new Set(), methodLevel: new Set() });
    expect((await app.request('/test')).status).toBe(200);
    expect(calls).toBe(2);
  });

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

describe('middleware error propagation', () => {
  it('resolves next() with undefined even when Hono dispatch returns a Context', async () => {
    let completion: unknown = 'pending';
    class ObserverMiddleware {
      async use(next: Next) {
        completion = await next();
        return undefined;
      }
    }
    const app = new Hono();
    app.use(resolveMiddleware(ObserverMiddleware, { get: (cls) => new cls() }));
    app.get('/test', (ctx) => ctx.json({ ok: true }));

    expect((await app.request('/test')).status).toBe(200);
    expect(completion).toBeUndefined();
  });

  it('rejects next(value) instead of throwing when its request context is unavailable', async () => {
    let savedNext: Next<string> | undefined;
    class DeferredMiddleware {
      use(next: Next<string>) {
        savedNext = next;
        return new Response('deferred');
      }
    }
    const app = new Hono();
    app.use(resolveMiddleware(DeferredMiddleware, { get: (cls) => new cls() }));
    await runInContext(() => app.request('/test'));

    if (!savedNext) throw new Error('Expected a saved next callback');
    const completion = savedNext('late');
    expect(completion).toBeInstanceOf(Promise);
    await expect(completion).rejects.toBeInstanceOf(ZeltContextNotAvailableError);
  });

  it.each(['sync', 'async'])('reports a %s use failure to Hono once', async (mode) => {
    const failure = new Error('middleware failed');
    class FailingMiddleware {
      use() {
        if (mode === 'sync') throw failure;
        return Promise.reject(failure);
      }
    }
    const errors: Error[] = [];
    const app = new Hono();
    app.onError((error) => {
      errors.push(error);
      return new Response('handled', { status: 503 });
    });
    app.use(
      guardMiddleware(
        FailingMiddleware,
        resolveMiddleware(FailingMiddleware, { get: (cls) => new cls() }),
      ),
    );
    app.get('/test', (ctx) => ctx.json({ unexpected: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('handled');
    expect(errors).toEqual([failure]);
  });
});
