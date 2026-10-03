import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import {
  canMutateGeneratedResponse,
  preserveResponseIsolation,
  trackGeneratedResponse,
} from './response-ownership.lib';

describe('generated response ownership', () => {
  it('allows only the response tracked for that context', async () => {
    const app = new Hono();
    const res = new Response('tracked');
    app.get('/test', (ctx) => {
      expect(canMutateGeneratedResponse(ctx, res)).toBe(false);
      expect(trackGeneratedResponse(ctx, res)).toBe(res);
      expect(canMutateGeneratedResponse(ctx, res)).toBe(true);
      expect(canMutateGeneratedResponse(ctx, ctx.json({ other: true }))).toBe(false);
      return res;
    });
    app.get('/other', (ctx) => {
      expect(canMutateGeneratedResponse(ctx, res)).toBe(false);
      return ctx.json({ ok: true });
    });

    expect((await app.request('/test')).status).toBe(200);
    expect((await app.request('/other')).status).toBe(200);
  });

  it('preserves isolation after middleware observes a generated response', async () => {
    const app = new Hono();
    app.get('/test', (ctx) => {
      const res = trackGeneratedResponse(ctx, ctx.json({ ok: true }));
      preserveResponseIsolation(ctx);

      expect(canMutateGeneratedResponse(ctx, res)).toBe(false);
      const replacement = trackGeneratedResponse(ctx, ctx.json({ replacement: true }));
      expect(canMutateGeneratedResponse(ctx, replacement)).toBe(false);
      return replacement;
    });

    expect((await app.request('/test')).status).toBe(200);
  });

  it('preserves isolation when middleware runs before the response is generated', async () => {
    const app = new Hono();
    app.get('/test', (ctx) => {
      preserveResponseIsolation(ctx);
      const res = trackGeneratedResponse(ctx, ctx.json({ ok: true }));

      expect(canMutateGeneratedResponse(ctx, res)).toBe(false);
      return res;
    });

    expect((await app.request('/test')).status).toBe(200);
  });
});
