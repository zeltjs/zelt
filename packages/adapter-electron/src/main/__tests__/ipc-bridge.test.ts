import { describe, expect, it } from 'vitest';

import { toIpcResponse, toRequest } from '../ipc-bridge';

describe('toRequest', () => {
  it('converts IpcFetchRequest to Request with correct URL', () => {
    const request = toRequest(
      {
        method: 'GET',
        path: '/api/status',
        headers: [['accept', 'application/json']],
        body: { kind: 'none' },
      },
      'http://zelt-ipc',
    );

    expect(request.method).toBe('GET');
    expect(request.url).toBe('http://zelt-ipc/api/status');
    expect(request.headers.get('accept')).toBe('application/json');
  });

  it('converts text body', () => {
    const request = toRequest(
      {
        method: 'POST',
        path: '/api/data',
        headers: [['content-type', 'application/json']],
        body: { kind: 'text', value: '{"key":"value"}' },
      },
      'http://zelt-ipc',
    );

    expect(request.method).toBe('POST');
  });

  it('converts arrayBuffer body', () => {
    const buffer = new ArrayBuffer(4);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3, 4]);

    const request = toRequest(
      {
        method: 'PUT',
        path: '/api/upload',
        headers: [],
        body: { kind: 'arrayBuffer', value: buffer },
      },
      'http://zelt-ipc',
    );

    expect(request.method).toBe('PUT');
  });

  it('ignores body for GET requests', () => {
    const request = toRequest(
      {
        method: 'GET',
        path: '/api/data',
        headers: [],
        body: { kind: 'text', value: 'should-be-ignored' },
      },
      'http://zelt-ipc',
    );

    expect(request.body).toBeNull();
  });

  it('preserves query string in path', () => {
    const request = toRequest(
      {
        method: 'GET',
        path: '/api/search?q=test&page=1',
        headers: [],
        body: { kind: 'none' },
      },
      'http://zelt-ipc',
    );

    expect(request.url).toBe('http://zelt-ipc/api/search?q=test&page=1');
  });
});

describe('toIpcResponse', () => {
  it('converts text response', async () => {
    const response = new Response('hello', {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/plain' },
    });

    const ipcResponse = await toIpcResponse(response, 'GET');

    expect(ipcResponse.status).toBe(200);
    expect(ipcResponse.statusText).toBe('OK');
    expect(ipcResponse.body).toEqual({ kind: 'text', value: 'hello' });
    expect(ipcResponse.headers).toContainEqual(['content-type', 'text/plain']);
  });

  it('converts JSON response as text', async () => {
    const response = new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    const ipcResponse = await toIpcResponse(response, 'GET');

    expect(ipcResponse.body).toEqual({ kind: 'text', value: '{"ok":true}' });
  });

  it('converts binary response as arrayBuffer', async () => {
    const buffer = new ArrayBuffer(4);
    new Uint8Array(buffer).set([1, 2, 3, 4]);
    const response = new Response(buffer, {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    });

    const ipcResponse = await toIpcResponse(response, 'GET');

    expect(ipcResponse.body.kind).toBe('arrayBuffer');
  });

  it('returns none body for 204 status', async () => {
    const response = new Response(null, { status: 204 });

    const ipcResponse = await toIpcResponse(response, 'GET');

    expect(ipcResponse.body).toEqual({ kind: 'none' });
  });

  it('returns none body for 304 status', async () => {
    const response = new Response(null, { status: 304 });

    const ipcResponse = await toIpcResponse(response, 'GET');

    expect(ipcResponse.body).toEqual({ kind: 'none' });
  });

  it('returns none body for HEAD method', async () => {
    const response = new Response('has-body', { status: 200 });

    const ipcResponse = await toIpcResponse(response, 'HEAD');

    expect(ipcResponse.body).toEqual({ kind: 'none' });
  });

  it('converts image response as arrayBuffer', async () => {
    const buffer = new ArrayBuffer(8);
    const response = new Response(buffer, {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });

    const ipcResponse = await toIpcResponse(response, 'GET');

    expect(ipcResponse.body.kind).toBe('arrayBuffer');
  });
});
