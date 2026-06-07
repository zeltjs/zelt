import type { IpcBody, IpcFetchRequest, IpcFetchResponse, IpcSender } from '../shared/ipc.types';

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

  return new Response(body, {
    status: payload.status,
    statusText: payload.statusText,
    headers: payload.headers as [string, string][],
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
  const sender = Reflect.get(globalThis, channel) as IpcSender | undefined;

  if (!sender) {
    throw new Error(
      `IPC sender not found for channel "${channel}". Did you call exposeIpc() in the preload script?`,
    );
  }

  const ipcRequest = await toIpcRequest(input, init);
  const ipcResponse = await sender(ipcRequest);
  return toResponse(ipcResponse);
};
