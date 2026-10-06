import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { runInContext } from '../../kernel';
import { createRequestInjectionMiddleware } from './request-injection.lib';

describe('request injection completion', () => {
  it('returns undefined for both initial and nested injection', async () => {
    const completions: unknown[] = [];
    const injectRequest = createRequestInjectionMiddleware();
    const app = new Hono();
    app.use((_ctx, next) =>
      runInContext(async () => {
        await next();
      }),
    );
    for (let level = 0; level < 2; level++) {
      app.use(async (ctx, next) => {
        completions.push(await injectRequest(ctx, next));
      });
    }
    app.get('/test', (ctx) => ctx.json({ ok: true }));

    const res = await app.request('/test');
    expect(await res.json()).toEqual({ ok: true });
    expect(completions).toEqual([undefined, undefined]);
  });
});
