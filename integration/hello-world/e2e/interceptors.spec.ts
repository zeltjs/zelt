import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('Interceptors (via Middleware)', () => {
  let testApp: Awaited<ReturnType<(typeof app)['ready']>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('OverrideMiddleware transforms response (sync)', async () => {
    const res = await testApp.http.request('/interceptors/override');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBe('test');
  });

  it('TransformMiddleware maps response', async () => {
    const res = await testApp.http.request('/interceptors/transform');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: 'Hello, World!' });
  });

  it('TransformMiddleware maps response (async)', async () => {
    const res = await testApp.http.request('/interceptors/transform/async');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: 'Hello, World!' });
  });

  it('TransformMiddleware maps response (stream)', async () => {
    const res = await testApp.http.request('/interceptors/transform/stream');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: 'Hello, World!' });
  });

  it('StatusMiddleware modifies response status', async () => {
    const res = await testApp.http.request('/interceptors/status');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ data: 'Hello, World!' });
  });

  it('HeaderMiddleware modifies Authorization header', async () => {
    const res = await testApp.http.request('/interceptors/header');
    expect(res.status).toBe(200);
    expect(res.headers.get('Authorization')).toBe('jwt');
  });
});
