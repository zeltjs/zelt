import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { applyResponseHeaders } from './response-headers.lib';
import { preserveResponseIsolation, trackGeneratedResponse } from './response-ownership.lib';

describe('response header changes', () => {
  it('updates an unobserved generated response without replacing it', async () => {
    const app = new Hono();
    app.get('/', (ctx) => {
      const original = trackGeneratedResponse(
        ctx,
        ctx.json({ ok: true }, 201, { 'X-Remove': 'old' }),
      );
      ctx.res = original;
      applyResponseHeaders(ctx, [['X-New', 'value']], ['X-Remove']);
      expect(ctx.res).toBe(original);
      return ctx.res;
    });

    const result = await app.request('/');
    expect(result.status).toBe(201);
    expect(result.headers.get('X-New')).toBe('value');
    expect(result.headers.get('X-Remove')).toBeNull();
    expect(await result.json()).toEqual({ ok: true });
  });

  it.each([
    'external',
    'observed',
  ] as const)('preserves a reference to an %s response', async (kind) => {
    const original = new Response('body', {
      status: 202,
      statusText: 'Accepted',
      headers: [
        ['X-Remove', 'old'],
        ['Set-Cookie', 'a=1'],
        ['Set-Cookie', 'b=2'],
      ],
    });
    const app = new Hono();
    app.get('/', (ctx) => {
      if (kind === 'observed') {
        trackGeneratedResponse(ctx, original);
        preserveResponseIsolation(ctx);
      }
      ctx.res = original;
      applyResponseHeaders(
        ctx,
        [
          ['X-New', 'value'],
          ['X-Other', 'other'],
        ],
        ['X-Remove'],
      );
      expect(ctx.res).not.toBe(original);
      return ctx.res;
    });

    const result = await app.request('/');
    expect(result.status).toBe(202);
    expect(result.statusText).toBe('Accepted');
    expect(result.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
    expect(result.headers.get('X-New')).toBe('value');
    expect(result.headers.get('X-Other')).toBe('other');
    expect(result.headers.get('X-Remove')).toBeNull();
    expect(original.headers.get('X-Remove')).toBe('old');
    expect(original.headers.get('X-New')).toBeNull();
    expect(await result.text()).toBe('body');
  });

  it('isolates an external response when only removing headers', async () => {
    const original = new Response('body', { headers: { 'X-Remove': 'old' } });
    const app = new Hono();
    app.get('/', (ctx) => {
      ctx.res = original;
      applyResponseHeaders(ctx, [], ['X-Remove']);
      return ctx.res;
    });

    const result = await app.request('/');
    expect(result.headers.get('X-Remove')).toBeNull();
    expect(original.headers.get('X-Remove')).toBe('old');
    expect(await result.text()).toBe('body');
  });

  it('keeps the response reference when no changes are requested', async () => {
    const original = new Response('body');
    const app = new Hono();
    app.get('/', (ctx) => {
      ctx.res = original;
      applyResponseHeaders(ctx, [], []);
      return ctx.res;
    });

    expect(await app.request('/')).toBe(original);
  });
});
