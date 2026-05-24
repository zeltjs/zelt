import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('Hello World', () => {
  let testApp: Awaited<ReturnType<typeof onTest>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('GET /hello returns greeting', async () => {
    const res = await testApp.request('/hello');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'Hello, World!' });
  });

  it('GET /hello/:name returns personalized greeting', async () => {
    const res = await testApp.request('/hello/Alice');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'Hello, Alice!' });
  });

  it('GET /unknown returns 404', async () => {
    const res = await testApp.request('/unknown');
    expect(res.status).toBe(404);
  });
});
