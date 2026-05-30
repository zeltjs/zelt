import type { App, HttpModule } from '@zeltjs/core';
import type { TestableApp } from '@zeltjs/testing';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

const OVERLAP_REQUEST_COUNT = 1000;

describe('Overlapping requests preserve per-request context isolation', () => {
  let testApp: TestableApp<App<[HttpModule]>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('keeps requestId isolated when many requests are processed concurrently', async () => {
    const responses = await Promise.all(
      Array.from({ length: OVERLAP_REQUEST_COUNT }, (_unused, index) => {
        // Randomized delay forces requests to interleave inside the singleton.
        const delay = (index % 5) * 2;
        return testApp.request(`/scopes/overlap?id=req-${index}&delay=${delay}`);
      }),
    );

    expect(responses).toHaveLength(OVERLAP_REQUEST_COUNT);

    const payloads = await Promise.all(
      responses.map(async (res) => {
        expect(res.status).toBe(200);
        return (await res.json()) as { requestId: string; trace: string[] };
      }),
    );

    payloads.forEach((payload, index) => {
      expect(payload.requestId).toBe(`req-${index}`);
      expect(payload.trace).toEqual(['start', 'after-delay']);
    });

    const uniqueIds = new Set(payloads.map((p) => p.requestId));
    expect(uniqueIds.size).toBe(OVERLAP_REQUEST_COUNT);
  });
});
