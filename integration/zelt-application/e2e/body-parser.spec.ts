import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('Body parsing', () => {
  let testApp: Awaited<ReturnType<(typeof app)['createRuntime']>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('parses JSON request body', async () => {
    const res = await testApp.http.request('/body/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', age: 30 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ parsed: { name: 'Alice', age: 30 } });
  });

  it('returns 400 for invalid JSON payload', async () => {
    const res = await testApp.http.request('/body/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not valid',
    });
    expect(res.status).toBe(400);
  });

  it('parses text/plain request body', async () => {
    const res = await testApp.http.request('/body/text', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello zelt',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ length: 10, value: 'hello zelt' });
  });

  it('parses application/x-www-form-urlencoded body', async () => {
    const res = await testApp.http.request('/body/form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=John&role=admin',
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { fields: Record<string, unknown> };
    expect(json.fields).toEqual({ name: 'John', role: 'admin' });
  });

  it('parses multipart/form-data with file uploads', async () => {
    const formData = new FormData();
    formData.append('label', 'profile');
    formData.append('file', new File(['file-contents'], 'avatar.txt', { type: 'text/plain' }));

    const res = await testApp.http.request('/body/multipart', {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ filename: 'avatar.txt', label: 'profile' });
  });

  describe('empty / missing bodies', () => {
    it('returns 400 for empty JSON body', async () => {
      const res = await testApp.http.request('/body/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { code: string; message: string };
      expect(json.code).toBe('BAD_REQUEST');
      expect(json.message).toBe('Invalid JSON: Unexpected end of JSON input');
    });

    it('parses empty application/x-www-form-urlencoded body as empty object', async () => {
      const res = await testApp.http.request('/body/form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: '',
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ fields: {} });
    });

    it('parses empty multipart/form-data as empty fields', async () => {
      const res = await testApp.http.request('/body/multipart', {
        method: 'POST',
        body: new FormData(),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ filename: null });
    });

    // POST without Content-Type ideally returns 4xx. Zelt currently returns 500
    // (route-builder.ts produces body type 'none' which triggers
    // ZeltBodyTypeMismatchError, not mapped to a client error). These tests are
    // marked todo so the bug fix isn't treated as a regression.
    it.todo('returns 4xx for POST without Content-Type to a json endpoint', async () => {
      const res = await testApp.http.request('/body/json', { method: 'POST' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it.todo('returns 4xx for POST without Content-Type to a form endpoint', async () => {
      const res = await testApp.http.request('/body/form', { method: 'POST' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it.todo('returns 4xx for POST without Content-Type to a text endpoint', async () => {
      const res = await testApp.http.request('/body/text', { method: 'POST' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });
});
