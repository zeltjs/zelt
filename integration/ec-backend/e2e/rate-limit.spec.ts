import type { App, HttpModule } from '@zeltjs/core';
import type { TestableApp } from '@zeltjs/testing';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createEcApp } from '../src/app';

describe('Rate Limit', () => {
  let testApp: TestableApp<App<[HttpModule]>>;

  beforeAll(async () => {
    const app = createEcApp();
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('returns rate limit headers on login', async () => {
    await testApp.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'login-test@example.com',
        password: 'password123',
        name: 'Login Test',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await testApp.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'login-test@example.com', password: 'password123' }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
  });

  it('returns rate limit headers on register', async () => {
    const res = await testApp.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'ratelimit@example.com',
        password: 'password123',
        name: 'Rate Limit',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
  });

  it('returns 429 after exceeding register limit', async () => {
    const res = await testApp.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'one-more@example.com',
        password: 'password123',
        name: 'One More',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
