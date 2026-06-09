import { getContext, runInContext, setContext } from '@zeltjs/core';
import type { IpcMainInvokeEvent } from 'electron';
import { match } from 'ts-pattern';

import type { IpcBody, IpcFetchRequest, IpcFetchResponse } from '../shared/ipc.types';

const BODY_FORBIDDEN_METHODS = new Set(['GET', 'HEAD']);
const NO_BODY_STATUSES = new Set([204, 205, 304]);
const TEXT_CONTENT_TYPE_PREFIXES = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-www-form-urlencoded',
];

const isTextContentType = (contentType: string): boolean =>
  TEXT_CONTENT_TYPE_PREFIXES.some((prefix) => contentType.startsWith(prefix));

const toBody = (body: IpcBody): BodyInit | null =>
  match(body)
    .with({ kind: 'none' }, () => null)
    .with({ kind: 'text' }, ({ value }) => value)
    .with({ kind: 'arrayBuffer' }, ({ value }) => value)
    .exhaustive();

export const toRequest = (payload: IpcFetchRequest, baseUrl: string): Request => {
  const headers: [string, string][] = payload.headers.map(([k, v]) => [k, v]);
  return new Request(baseUrl + payload.path, {
    method: payload.method,
    headers,
    body: BODY_FORBIDDEN_METHODS.has(payload.method) ? null : toBody(payload.body),
  });
};

export const toIpcResponse = async (
  response: Response,
  method: string,
): Promise<IpcFetchResponse> => {
  const headers: [string, string][] = [];
  response.headers.forEach((value, key) => {
    headers.push([key, value]);
  });

  let body: IpcBody;
  if (NO_BODY_STATUSES.has(response.status) || method === 'HEAD') {
    body = { kind: 'none' };
  } else {
    const contentType = response.headers.get('content-type');
    if (contentType && isTextContentType(contentType)) {
      body = { kind: 'text', value: await response.text() };
    } else {
      body = { kind: 'arrayBuffer', value: await response.arrayBuffer() };
    }
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    body,
  };
};

declare module '@zeltjs/core' {
  interface RequestContextSchema {
    ipcEvent: IpcMainInvokeEvent;
  }
}

type IpcMainLike = {
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, payload: IpcFetchRequest) => unknown,
  ): void;
  removeHandler(channel: string): void;
};

/** @throws {ZeltContextNotAvailableError} */
export const ipcEvent = (): IpcMainInvokeEvent | undefined => getContext('ipcEvent');

/** @throws {ZeltContextNotAvailableError} */
export const setupIpcBridge = (
  ipcMain: IpcMainLike,
  fetch: (request: Request) => Promise<Response>,
  channel: string,
): (() => void) => {
  ipcMain.handle(channel, async (event, payload) =>
    runInContext(async () => {
      setContext('ipcEvent', event);
      const request = toRequest(payload, channel);
      const response = await fetch(request);
      return toIpcResponse(response, payload.method);
    }),
  );

  return () => {
    ipcMain.removeHandler(channel);
  };
};
