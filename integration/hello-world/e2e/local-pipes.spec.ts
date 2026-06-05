import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('Local Pipes (Parameter Transformation)', () => {
  let testApp: Awaited<ReturnType<(typeof app)['createRuntime']>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('GET /pipes/user/:id parses numeric id', async () => {
    const res = await testApp.http.request('/pipes/user/42');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: 42, greeting: 'Hello, World!' });
  });

  it('GET /pipes/user/:id returns 400 for invalid id', async () => {
    const res = await testApp.http.request('/pipes/user/not-a-number');
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain('Invalid integer');
  });

  it('GET /pipes/user/:id returns 400 for partially numeric id', async () => {
    const res = await testApp.http.request('/pipes/user/42abc');
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain('Invalid integer');
  });

  it('GET /pipes/transform/:value transforms string', async () => {
    const res = await testApp.http.request('/pipes/transform/Hello');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      original: 'Hello',
      upper: 'HELLO',
      lower: 'hello',
    });
  });
});
