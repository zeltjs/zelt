import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('URI Versioning - with middleware applied', () => {
  let testApp: Awaited<ReturnType<(typeof app)['createRuntime']>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  describe('GET /middleware', () => {
    it('should return "Hello from middleware function!" (v1)', async () => {
      const res = await testApp.http.request('/v1/middleware');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Hello from middleware function!');
    });
  });

  describe('GET /middleware/override', () => {
    it('should return "Hello from middleware function!" (v2)', async () => {
      const res = await testApp.http.request('/v2/middleware/override');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Hello from middleware function!');
    });
  });

  describe('GET /middleware/multiple', () => {
    it('should return "Hello from middleware function!" (v1)', async () => {
      const res = await testApp.http.request('/v1/middleware/multiple');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Hello from middleware function!');
    });

    it('should return "Hello from middleware function!" (v2)', async () => {
      const res = await testApp.http.request('/v2/middleware/multiple');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Hello from middleware function!');
    });
  });

  describe('GET /middleware/neutral', () => {
    it('should return "Hello from middleware function!" (no version)', async () => {
      const res = await testApp.http.request('/middleware/neutral');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Hello from middleware function!');
    });
  });
});
