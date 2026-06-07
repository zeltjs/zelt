import { describe, expect, it } from 'vitest';

import { toIpcRequest, toResponse } from '../ipc-fetch';

describe('toIpcRequest', () => {
  it('converts GET request with no body', async () => {
    const result = await toIpcRequest('http://zelt-ipc/api/status');

    expect(result.method).toBe('GET');
    expect(result.path).toBe('/api/status');
    expect(result.body).toEqual({ kind: 'none' });
  });

  it('converts POST request with text body', async () => {
    const result = await toIpcRequest('http://zelt-ipc/api/data', {
      method: 'POST',
      body: '{"key":"value"}',
      headers: { 'content-type': 'application/json' },
    });

    expect(result.method).toBe('POST');
    expect(result.path).toBe('/api/data');
    expect(result.body).toEqual({ kind: 'text', value: '{"key":"value"}' });
  });

  it('converts request with ArrayBuffer body', async () => {
    const buffer = new ArrayBuffer(4);
    new Uint8Array(buffer).set([1, 2, 3, 4]);

    const result = await toIpcRequest('http://zelt-ipc/api/upload', {
      method: 'PUT',
      body: buffer,
      headers: { 'content-type': 'application/octet-stream' },
    });

    expect(result.method).toBe('PUT');
    expect(result.body.kind).toBe('arrayBuffer');
  });

  it('preserves query string', async () => {
    const result = await toIpcRequest('http://zelt-ipc/api/search?q=test&page=2');

    expect(result.path).toBe('/api/search?q=test&page=2');
  });

  it('converts headers to entries', async () => {
    const result = await toIpcRequest('http://zelt-ipc/api/data', {
      headers: { 'x-custom': 'value', accept: 'text/plain' },
    });

    expect(result.headers).toContainEqual(['x-custom', 'value']);
    expect(result.headers).toContainEqual(['accept', 'text/plain']);
  });

  it('handles URL object input', async () => {
    const url = new URL('http://zelt-ipc/api/status');
    const result = await toIpcRequest(url);

    expect(result.method).toBe('GET');
    expect(result.path).toBe('/api/status');
  });

  it('handles Request object input', async () => {
    const request = new Request('http://zelt-ipc/api/data', {
      method: 'POST',
      body: 'test',
      headers: { 'content-type': 'text/plain' },
    });
    const result = await toIpcRequest(request);

    expect(result.method).toBe('POST');
    expect(result.path).toBe('/api/data');
    expect(result.body).toEqual({ kind: 'text', value: 'test' });
  });
});

describe('toResponse', () => {
  it('converts text body to Response', () => {
    const response = toResponse({
      status: 200,
      statusText: 'OK',
      headers: [['content-type', 'text/plain']],
      body: { kind: 'text', value: 'hello' },
    });

    expect(response.status).toBe(200);
    expect(response.statusText).toBe('OK');
    expect(response.headers.get('content-type')).toBe('text/plain');
  });

  it('converts none body to Response', () => {
    const response = toResponse({
      status: 204,
      statusText: 'No Content',
      headers: [],
      body: { kind: 'none' },
    });

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it('converts arrayBuffer body to Response', async () => {
    const buffer = new ArrayBuffer(4);
    new Uint8Array(buffer).set([10, 20, 30, 40]);

    const response = toResponse({
      status: 200,
      statusText: 'OK',
      headers: [['content-type', 'application/octet-stream']],
      body: { kind: 'arrayBuffer', value: buffer },
    });

    const result = new Uint8Array(await response.arrayBuffer());
    expect(result).toEqual(new Uint8Array([10, 20, 30, 40]));
  });
});
