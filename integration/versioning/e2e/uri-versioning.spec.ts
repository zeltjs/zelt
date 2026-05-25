import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('URI Versioning', () => {
  let testApp: Awaited<ReturnType<typeof onTest>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  describe('GET /', () => {
    it('V1', async () => {
      const res = await testApp.request('/v1/');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Hello World V1!');
    });

    it('V2', async () => {
      const res = await testApp.request('/v2/');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Hello World V2!');
    });

    it('V3', async () => {
      const res = await testApp.request('/v3/');
      expect(res.status).toBe(404);
    });

    it('No Version', async () => {
      const res = await testApp.request('/');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /:param/hello', () => {
    it('V1', async () => {
      const res = await testApp.request('/v1/param/hello');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Parameter V1!');
    });

    it('V2', async () => {
      const res = await testApp.request('/v2/param/hello');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Parameter V2!');
    });

    it('V3', async () => {
      const res = await testApp.request('/v3/param/hello');
      expect(res.status).toBe(404);
    });

    it('No Version', async () => {
      const res = await testApp.request('/param/hello');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /multiple', () => {
    it('V1', async () => {
      const res = await testApp.request('/v1/multiple');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Multiple Versions 1 or 2');
    });

    it('V2', async () => {
      const res = await testApp.request('/v2/multiple');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Multiple Versions 1 or 2');
    });

    it('V3', async () => {
      const res = await testApp.request('/v3/multiple');
      expect(res.status).toBe(404);
    });

    it('No Version', async () => {
      const res = await testApp.request('/multiple');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /neutral', () => {
    it('No Version (version-neutral controller)', async () => {
      const res = await testApp.request('/neutral');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Neutral');
    });
  });

  describe('GET /override', () => {
    it('V1', async () => {
      const res = await testApp.request('/v1/override');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Override Version 1');
    });

    it('V2', async () => {
      const res = await testApp.request('/v2/override');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Override Version 2');
    });

    it('V3', async () => {
      const res = await testApp.request('/v3/override');
      expect(res.status).toBe(404);
    });

    it('No Version', async () => {
      const res = await testApp.request('/override');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /override-partial', () => {
    it('V1', async () => {
      const res = await testApp.request('/v1/override-partial');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Override Partial Version 1');
    });

    it('V2', async () => {
      const res = await testApp.request('/v2/override-partial');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Override Partial Version 2');
    });

    it('V3', async () => {
      const res = await testApp.request('/v3/override-partial');
      expect(res.status).toBe(404);
    });

    it('No Version', async () => {
      const res = await testApp.request('/override-partial');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /foo/bar (no versioning controller)', () => {
    it('V1', async () => {
      const res = await testApp.request('/v1/foo/bar');
      expect(res.status).toBe(404);
    });

    it('V2', async () => {
      const res = await testApp.request('/v2/foo/bar');
      expect(res.status).toBe(404);
    });

    it('V3', async () => {
      const res = await testApp.request('/v3/foo/bar');
      expect(res.status).toBe(404);
    });

    it('No Version', async () => {
      const res = await testApp.request('/foo/bar');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Hello FooBar!');
    });
  });

  describe('GET /default-version (defaultVersion equivalent)', () => {
    it('No Version falls back to default (v1) handler', async () => {
      const res = await testApp.request('/default-version');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Default Version (v1)');
    });

    it('V1 explicit resolves to the same response as default', async () => {
      const res = await testApp.request('/v1/default-version');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Default Version (v1)');
    });

    it('V2 has no handler (no default fallback to v1 for unknown versions)', async () => {
      const res = await testApp.request('/v2/default-version');
      expect(res.status).toBe(404);
    });
  });

  describe('Global prefix (/api/v1) with exclude', () => {
    it('GET /api/v1/users is served by the prefixed controller', async () => {
      const res = await testApp.request('/api/v1/users');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Users under /api/v1');
    });

    it('GET /api/v1/posts is served by the prefixed controller', async () => {
      const res = await testApp.request('/api/v1/posts');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Posts under /api/v1');
    });

    it('GET /api/v1/exclude-path is served by the exclude controller', async () => {
      const res = await testApp.request('/api/v1/exclude-path');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Excluded from prefix');
    });

    it('GET /users (no prefix) is not registered', async () => {
      const res = await testApp.request('/users');
      expect(res.status).toBe(404);
    });

    it('GET /api/v1/unknown returns 404', async () => {
      const res = await testApp.request('/api/v1/unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('Deep nested URI versioning (/vX/api/users/:id/posts/:postId)', () => {
    it('V1 resolves both path parameters', async () => {
      const res = await testApp.request('/v1/api/users/42/posts/7');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('V1 user=42 post=7');
    });

    it('V2 resolves both path parameters', async () => {
      const res = await testApp.request('/v2/api/users/42/posts/7');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('V2 user=42 post=7');
    });

    it('V3 has no handler', async () => {
      const res = await testApp.request('/v3/api/users/42/posts/7');
      expect(res.status).toBe(404);
    });

    it('No Version has no handler', async () => {
      const res = await testApp.request('/api/users/42/posts/7');
      expect(res.status).toBe(404);
    });

    it('Missing trailing segment returns 404', async () => {
      const res = await testApp.request('/v1/api/users/42/posts');
      expect(res.status).toBe(404);
    });
  });
});
