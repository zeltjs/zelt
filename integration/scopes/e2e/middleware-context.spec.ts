import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

type ContextResponse = {
  idFromQuery: string | undefined;
  requestId: string | undefined;
  middlewareTag: string | undefined;
  middlewareChain: string[];
};

describe('Middleware <-> handler context integration', () => {
  let testApp: Awaited<ReturnType<(typeof app)['ready']>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  describe('context isolation between middleware and handler', () => {
    it('exposes setContext values from middleware to the handler via getContext', async () => {
      const res = await testApp.http.request('/middleware/context?id=req-A');
      expect(res.status).toBe(200);
      const body = (await res.json()) as ContextResponse;

      expect(body.idFromQuery).toBe('req-A');
      expect(body.requestId).toBe('req-A');
      // The last middleware in the chain wins for an overwritten key.
      expect(body.middlewareTag).toBe('stage-two');
      // Order is global -> controller-level (stage-one) -> controller-level (stage-two).
      expect(body.middlewareChain).toEqual(['stage-one', 'stage-two']);
    });

    it('isolates context values across sequential requests', async () => {
      const first = (await (
        await testApp.http.request('/middleware/context?id=seq-1')
      ).json()) as ContextResponse;
      const second = (await (
        await testApp.http.request('/middleware/context?id=seq-2')
      ).json()) as ContextResponse;

      expect(first.requestId).toBe('seq-1');
      expect(second.requestId).toBe('seq-2');
      // Each request starts from an empty chain because the global middleware
      // re-initializes the bucket per request.
      expect(first.middlewareChain).toEqual(['stage-one', 'stage-two']);
      expect(second.middlewareChain).toEqual(['stage-one', 'stage-two']);
    });
  });

  describe('multi-middleware chain propagation', () => {
    it('appends entries across all middlewares in declaration order', async () => {
      const res = await testApp.http.request('/middleware/context?id=chain-1');
      const body = (await res.json()) as ContextResponse;
      expect(body.middlewareChain).toEqual(['stage-one', 'stage-two']);
    });

    it('preserves chain order under concurrent requests', async () => {
      const responses = await Promise.all(
        Array.from({ length: 50 }, (_unused, index) =>
          testApp.http.request(`/middleware/context?id=chain-${index}`),
        ),
      );
      const payloads = await Promise.all(
        responses.map(async (r) => (await r.json()) as ContextResponse),
      );

      payloads.forEach((payload, index) => {
        expect(payload.requestId).toBe(`chain-${index}`);
        expect(payload.middlewareChain).toEqual(['stage-one', 'stage-two']);
      });
    });
  });

  describe('error in middleware does not leak across requests', () => {
    it('failing requests return 500 while parallel non-failing requests retain correct context', async () => {
      const SAMPLES = 40;
      const responses = await Promise.all(
        Array.from({ length: SAMPLES }, (_unused, index) => {
          const fail = index % 2 === 0 ? '1' : '0';
          return testApp.http.request(`/middleware/fail-safe?id=mix-${index}&fail=${fail}`);
        }),
      );

      for (const [index, res] of responses.entries()) {
        if (index % 2 === 0) {
          expect(res.status).toBe(500);
        } else {
          expect(res.status).toBe(200);
          const body = (await res.json()) as ContextResponse;
          expect(body.requestId).toBe(`mix-${index}`);
          // Non-failing requests must observe the full middleware chain,
          // unaffected by the failures running in parallel.
          expect(body.middlewareChain).toEqual(['stage-one', 'stage-two']);
          expect(body.middlewareTag).toBe('stage-two');
        }
      }
    });

    it('a subsequent request after a failure starts with a fresh context', async () => {
      const failed = await testApp.http.request('/middleware/fail-safe?id=will-fail&fail=1');
      expect(failed.status).toBe(500);

      const ok = await testApp.http.request('/middleware/context?id=after-fail');
      const body = (await ok.json()) as ContextResponse;
      expect(body.requestId).toBe('after-fail');
      expect(body.middlewareChain).toEqual(['stage-one', 'stage-two']);
    });
  });
});
