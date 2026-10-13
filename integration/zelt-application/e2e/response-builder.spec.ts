import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('Response builder', () => {
  let testApp: Awaited<ReturnType<(typeof app)['createRuntime']>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('returns JSON with default 200 status', async () => {
    const res = await testApp.http.request('/response/json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns JSON with custom status code', async () => {
    const res = await testApp.http.request('/response/json-status');
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ created: true });
  });

  it('keeps a chained error status, header and JSON body together', async () => {
    const res = await testApp.http.request('/response/bad-request');
    expect(res.status).toBe(400);
    expect(res.headers.get('x-reason')).toBe('invalid');
    expect(await res.json()).toEqual({ code: 'INVALID' });
  });

  it('returns an explicit server error', async () => {
    const res = await testApp.http.request('/response/unavailable');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: 'UNAVAILABLE' });
  });

  it.each([
    ['/response/no-content', 204, null],
    ['/response/not-modified', 304, 'cached'],
  ] as const)('returns an empty body for %s', async (path, status, etag) => {
    const res = await testApp.http.request(path);
    expect(res.status).toBe(status);
    expect(res.body).toBeNull();
    expect(res.headers.get('etag')).toBe(etag);
    expect(await res.text()).toBe('');
  });

  it('returns text/plain payload', async () => {
    const res = await testApp.http.request('/response/text');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('plain text');
  });

  it('chains multiple custom headers', async () => {
    const res = await testApp.http.request('/response/headers');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Custom')).toBe('custom-value');
    expect(res.headers.get('X-Another')).toBe('another-value');
  });

  it('issues a 302 redirect with Location header', async () => {
    const res = await testApp.http.request('/response/redirect', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/response/json');
  });

  it('sets a cookie via Set-Cookie header', async () => {
    const res = await testApp.http.request('/response/cookie');
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/session=abc123/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });
});
