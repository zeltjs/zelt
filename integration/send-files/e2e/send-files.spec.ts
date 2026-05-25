import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';
import { README_BUFFER, README_STRING } from '../src/fixtures';

describe('Send Files', () => {
  let testApp: Awaited<ReturnType<typeof onTest>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('should return a file from a stream', async () => {
    const res = await testApp.request('/file/stream');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe(README_STRING);
  });

  it('should return a file from a buffer', async () => {
    const res = await testApp.request('/file/buffer');
    expect(res.status).toBe(200);
    const buffer = new Uint8Array(await res.arrayBuffer());
    expect(buffer.byteLength).toBe(README_BUFFER.byteLength);
    expect(Buffer.from(buffer).toString('utf8')).toBe(README_STRING);
  });

  it('should not stream a non-file', async () => {
    const res = await testApp.request('/non-file/pipe-method');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ value: 'Hello world' });
  });

  it('should return a file from an async stream', async () => {
    const res = await testApp.request('/file/async/stream');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe(README_STRING);
  });

  it('should return a file with correct headers', async () => {
    const res = await testApp.request('/file/with/headers');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/markdown');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="Readme.md"');
    expect(res.headers.get('content-length')).toBe(String(README_BUFFER.byteLength));
    const text = await res.text();
    expect(text).toBe(README_STRING);
  });

  it('should return an error if the file does not exist', async () => {
    const res = await testApp.request('/file/not/exist');
    expect(res.status).toBe(400);
  });
});
