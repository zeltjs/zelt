import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import { ipcEvent, setupIpcBridge, toIpcResponse, toRequest } from './main/ipc-bridge';
import type { IpcFetchRequest } from './shared/ipc.types';

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

  it('normalizes trailing slash in baseUrl', () => {
    const request = toRequest(
      {
        method: 'GET',
        path: '/api/status',
        headers: [],
        body: { kind: 'none' },
      },
      'http://app/',
    );

    expect(request.url).toBe('http://app/api/status');
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

describe('setupIpcBridge', () => {
  const createFakeIpcMain = () => {
    let registeredHandler: (event: IpcMainInvokeEvent, payload: IpcFetchRequest) => unknown = () =>
      undefined;
    return {
      ipcMain: {
        handle: (
          _channel: string,
          listener: (event: IpcMainInvokeEvent, payload: IpcFetchRequest) => unknown,
        ) => {
          registeredHandler = listener;
        },
        removeHandler: () => {},
      },
      invoke: (event: IpcMainInvokeEvent, payload: IpcFetchRequest) =>
        registeredHandler(event, payload),
    };
  };

  it('makes IpcMainInvokeEvent accessible via ipcEvent() during fetch', async () => {
    const fakeEvent = { sender: { id: 42 } } as unknown as IpcMainInvokeEvent;
    let capturedEvent: IpcMainInvokeEvent | undefined;

    const fakeFetch = async (_request: Request): Promise<Response> => {
      capturedEvent = ipcEvent();
      return new Response('ok');
    };

    const { ipcMain, invoke } = createFakeIpcMain();
    setupIpcBridge(ipcMain, fakeFetch, 'http://test');

    await invoke(fakeEvent, {
      method: 'GET',
      path: '/api/test',
      headers: [],
      body: { kind: 'none' },
    });

    expect(capturedEvent).toBe(fakeEvent);
  });

  it('isolates ipcEvent across concurrent requests', async () => {
    const events: unknown[] = [];

    const fakeFetch = async (_request: Request): Promise<Response> => {
      await new Promise((r) => setTimeout(r, 5));
      events.push(ipcEvent());
      return new Response('ok');
    };

    const { ipcMain, invoke } = createFakeIpcMain();
    setupIpcBridge(ipcMain, fakeFetch, 'http://test');

    const payload: IpcFetchRequest = {
      method: 'GET',
      path: '/test',
      headers: [],
      body: { kind: 'none' },
    };

    await Promise.all([
      invoke({ id: 'event-a' } as unknown as IpcMainInvokeEvent, payload),
      invoke({ id: 'event-b' } as unknown as IpcMainInvokeEvent, payload),
    ]);

    expect(events).toEqual([{ id: 'event-a' }, { id: 'event-b' }]);
  });

  it('returns cleanup function that removes handler', () => {
    let removedChannel: string | undefined;
    const fakeIpcMain = {
      handle: () => {},
      removeHandler: (channel: string) => {
        removedChannel = channel;
      },
    } as unknown as Parameters<typeof setupIpcBridge>[0];

    const cleanup = setupIpcBridge(fakeIpcMain, async () => new Response('ok'), 'http://test');
    cleanup();

    expect(removedChannel).toBe('http://test');
  });
});
