import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('Routing behaviour', () => {
  let testApp: Awaited<ReturnType<(typeof app)['ready']>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('returns 404 for unknown paths', async () => {
    const res = await testApp.http.request('/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('treats path matching as case sensitive', async () => {
    const matched = await testApp.http.request('/routing/case');
    expect(matched.status).toBe(200);
    expect(await matched.json()).toEqual({ matched: 'lowercase' });

    const mismatched = await testApp.http.request('/routing/CASE');
    expect(mismatched.status).toBe(404);
  });

  it('extracts a single path param', async () => {
    const res = await testApp.http.request('/routing/params/abc-123');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'abc-123' });
  });

  it('extracts multiple path params', async () => {
    const res = await testApp.http.request('/routing/multi/foo/bar');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ a: 'foo', b: 'bar' });
  });

  it('dispatches POST/PUT/PATCH/DELETE to distinct handlers', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const res = await testApp.http.request('/routing/methods', { method });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ method });
    }
  });

  it('returns 404 for an unsupported method on a known path', async () => {
    const res = await testApp.http.request('/routing/methods');
    expect(res.status).toBe(404);
  });

  it('honors custom status codes from the response builder', async () => {
    const res = await testApp.http.request('/routing/custom-status');
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ created: true });
  });
});
