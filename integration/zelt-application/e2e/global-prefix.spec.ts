import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('Global prefix (via @Controller path)', () => {
  let testApp: Awaited<ReturnType<typeof onTest>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('resolves a route under /api/v1 prefix', async () => {
    const res = await testApp.request('/api/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'up' });
  });

  it('returns 404 when prefix is missing', async () => {
    const res = await testApp.request('/health');
    expect(res.status).toBe(404);
  });

  it('supports multiple methods under the same prefixed path', async () => {
    const listRes = await testApp.request('/api/v1/users');
    expect(listRes.status).toBe(200);
    expect(await listRes.json()).toEqual({ users: [] });

    const createRes = await testApp.request('/api/v1/users', { method: 'POST' });
    expect(createRes.status).toBe(200);
    expect(await createRes.json()).toEqual({ created: true });
  });

  it('captures path params alongside the prefix', async () => {
    const res = await testApp.request('/api/v1/users/42');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '42' });
  });

  it('captures params declared inside the prefix segment', async () => {
    const res = await testApp.request('/api/tenant-1/items');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenantId: 'tenant-1' });
  });
});
