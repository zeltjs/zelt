import type { IpcBody, IpcFetchRequest, IpcFetchResponse } from '../shared/ipc.types';

const TEXT_CONTENT_TYPE_PREFIXES = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-www-form-urlencoded',
];

const isTextContentType = (contentType: string): boolean =>
  TEXT_CONTENT_TYPE_PREFIXES.some((prefix) => contentType.startsWith(prefix));

export const toIpcRequest = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<IpcFetchRequest> => {
  const request = new Request(input, init);
  const url = new URL(request.url);

  const headers: [string, string][] = [];
  request.headers.forEach((value, key) => {
    headers.push([key, value]);
  });

  let body: IpcBody;
  if (request.body === null) {
    body = { kind: 'none' };
  } else {
    const contentType = request.headers.get('content-type');
    if (contentType && isTextContentType(contentType)) {
      body = { kind: 'text', value: await request.text() };
    } else {
      body = { kind: 'arrayBuffer', value: await request.arrayBuffer() };
    }
  }

  return {
    method: request.method,
    path: url.pathname + url.search,
    headers,
    body,
  };
};

export const toResponse = (payload: IpcFetchResponse): Response => {
  let body: BodyInit | null = null;
  if (payload.body.kind === 'text') {
    body = payload.body.value;
  } else if (payload.body.kind === 'arrayBuffer') {
    body = payload.body.value;
  }

  const headers: [string, string][] = payload.headers.map(([k, v]) => [k, v]);
  return new Response(body, {
    status: payload.status,
    statusText: payload.statusText,
    headers,
  });
};

const DEFAULT_IPC_CHANNEL = 'http://zelt-ipc';

export type IpcFetchOptions = {
  readonly channel?: string;
};

/**
 * @throws {Error} when the IPC sender is not registered for the given channel
 */
export const ipcFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: IpcFetchOptions,
): Promise<Response> => {
  const channel = options?.channel ?? DEFAULT_IPC_CHANNEL;
  const senderCandidate: unknown = Reflect.get(globalThis, channel);

  if (typeof senderCandidate !== 'function') {
    throw new Error(
      `IPC sender not found for channel "${channel}". Did you call exposeIpc() in the preload script?`,
    );
  }

  const ipcRequest = await toIpcRequest(input, init);
  return toResponse(await senderCandidate.call(null, ipcRequest));
};
