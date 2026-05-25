import { createApp } from '@zeltjs/core';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authMiddleware } from '../src/auth.middleware';
import { GuardsController } from '../src/guards.controller';

describe('Guards (Authorization)', () => {
  let testApp: Awaited<ReturnType<typeof onTest>>;

  beforeAll(async () => {
    const app = createApp({
      http: {
        controllers: [GuardsController],
        middlewares: [authMiddleware],
      },
    });
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('returns 401 when not authenticated', async () => {
    const res = await testApp.request('/guards/protected');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('allows access when authenticated with @Authorized()', async () => {
    const res = await testApp.request('/guards/protected', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual({ id: 1, name: 'alice' });
  });

  it('returns 403 when user lacks required role', async () => {
    const res = await testApp.request('/guards/admin-only', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('allows access when user has required role', async () => {
    const res = await testApp.request('/guards/admin-only', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ secret: 'admin data' });
  });

  it('allows access when user has one of multiple required roles', async () => {
    const res = await testApp.request('/guards/editor-or-admin', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ content: 'editable' });
  });
});
