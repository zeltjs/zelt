import { Controller, createApp, http, Post, request } from '@zeltjs/core';
import { object, string } from 'valibot';
import { describe, expect, it } from 'vitest';

import { RateLimit } from './rate-limit.middleware';

const LoginSchema = object({ email: string() });

describe('rate-limit integration with primitives', () => {
  it('uses ip() in dynamic key', async () => {
    @Controller('/auth')
    class AuthController {
      @Post('/login')
      @RateLimit({ limit: 1, windowSec: 60, key: () => `login:${request().ip()}` })
      async login(req = request(LoginSchema)) {
        await req.body();
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [AuthController] })]);
    const readyApp = await app.createRuntime();

    const r1 = await readyApp.http.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.1.1.1' },
      body: JSON.stringify({ email: 'a@a' }),
    });
    expect(r1.status).toBe(200);

    // Same IP — blocked
    const r2 = await readyApp.http.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.1.1.1' },
      body: JSON.stringify({ email: 'a@a' }),
    });
    expect(r2.status).toBe(429);

    // Different IP — allowed
    const r3 = await readyApp.http.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '2.2.2.2' },
      body: JSON.stringify({ email: 'a@a' }),
    });
    expect(r3.status).toBe(200);
  });

  it('uses request() body in dynamic key (per-email rate limit)', async () => {
    @Controller('/auth')
    class AuthController2 {
      @Post('/login')
      @RateLimit({
        limit: 1,
        windowSec: 60,
        key: async () => `login:${(await request(LoginSchema).body()).email}`,
      })
      async login(req = request(LoginSchema)) {
        await req.body();
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [AuthController2] })]);
    const readyApp = await app.createRuntime();

    const r1 = await readyApp.http.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@a' }),
    });
    expect(r1.status).toBe(200);

    const r2 = await readyApp.http.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@a' }),
    });
    expect(r2.status).toBe(429);

    const r3 = await readyApp.http.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'b@b' }),
    });
    expect(r3.status).toBe(200);
  });
});
