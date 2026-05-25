import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('Response builder', () => {
  let testApp: Awaited<ReturnType<typeof onTest>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('returns JSON with default 200 status', async () => {
    const res = await testApp.request('/response/json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns JSON with custom status code', async () => {
    const res = await testApp.request('/response/json-status');
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ created: true });
  });

  it('returns text/plain payload', async () => {
    const res = await testApp.request('/response/text');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('plain text');
  });

  it('chains multiple custom headers', async () => {
    const res = await testApp.request('/response/headers');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Custom')).toBe('custom-value');
    expect(res.headers.get('X-Another')).toBe('another-value');
  });

  it('issues a 302 redirect with Location header', async () => {
    const res = await testApp.request('/response/redirect', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/response/json');
  });

  it('sets a cookie via Set-Cookie header', async () => {
    const res = await testApp.request('/response/cookie');
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/session=abc123/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });
});
