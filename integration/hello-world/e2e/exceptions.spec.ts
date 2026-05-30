import type { App, HttpModule } from '@zeltjs/core';
import type { TestableApp } from '@zeltjs/testing';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('Exceptions', () => {
  let testApp: TestableApp<App<[HttpModule]>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('GET /errors/sync returns 400 with error message', async () => {
    const res = await testApp.request('/errors/sync');
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe('Integration test');
  });

  it('GET /errors/async returns 400 with error message (Promise/async)', async () => {
    const res = await testApp.request('/errors/async');
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe('Integration test');
  });

  it('GET /errors/unexpected returns 500 for unhandled errors', async () => {
    const res = await testApp.request('/errors/unexpected');
    expect(res.status).toBe(500);
  });
});
