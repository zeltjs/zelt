import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './helpers/test-setup';
import { createTestApp, shutdownAll } from './helpers/test-setup';

describe('Rate Limit', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('returns rate limit headers on login', async () => {
    // Register a user first so login doesn't 401 before rate limit middleware runs
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
    for (let i = 0; i < 3; i++) {
      await testApp.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: `flood-${i}@example.com`,
          password: 'password123',
          name: `Flood ${i}`,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
