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

  it('returns rate limit headers on successful request', async () => {
    const res = await testApp.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'header-test@example.com',
        password: 'password123',
        name: 'Header Test',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
  });

  it('returns 429 after exceeding limit', async () => {
    for (let i = 0; i < 2; i++) {
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
