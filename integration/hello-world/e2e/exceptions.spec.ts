import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('Exceptions', () => {
  let testApp: Awaited<ReturnType<(typeof app)['ready']>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('GET /errors/sync returns 400 with error message', async () => {
    const res = await testApp.http.request('/errors/sync');
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe('Integration test');
  });

  it('GET /errors/async returns 400 with error message (Promise/async)', async () => {
    const res = await testApp.http.request('/errors/async');
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe('Integration test');
  });

  it('GET /errors/unexpected returns 500 for unhandled errors', async () => {
    const res = await testApp.http.request('/errors/unexpected');
    expect(res.status).toBe(500);
  });
});
