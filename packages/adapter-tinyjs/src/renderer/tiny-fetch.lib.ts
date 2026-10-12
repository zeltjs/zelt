import * as v from 'valibot';
import {
  bridgeUrl,
  collectHeaders,
  decodeBody,
  encodeBytes,
  NativeBridgeSchema,
  parseBridgeResponse,
  requestSignal,
} from '../shared';
import type { TinyjsApiBridge, TinyjsFetchRequest } from '../shared/bridge.types';
import { DEFAULT_TINYJS_ORIGIN, TINYJS_FETCH_METHOD } from '../shared/bridge.types';

export type TinyjsFetchOptions = {
  readonly bridge?: TinyjsApiBridge;
  readonly origin?: string;
  readonly feature?: string;
};

/** @throws {TypeError} */
const nativeBridge = (): TinyjsApiBridge => {
  const tiny: unknown = Reflect.get(globalThis, 'tiny');
  const parsed = v.safeParse(NativeBridgeSchema, tiny);
  if (!parsed.success) {
    throw new TypeError(
      'tinyjs bridge is unavailable. Open this page in a tinyjs window or provide a bridge.',
    );
  }
  const api = parsed.output.api;
  const call = api.call;
  return {
    call: async (method, params) => {
      const value: unknown = await call.call(api, method, params);
      return value;
    },
  };
};

const toPayload = async (request: Request, feature: string): Promise<TinyjsFetchRequest> => {
  const url = new URL(request.url);
  return {
    feature,
    method: request.method,
    path: url.pathname + url.search,
    headers: collectHeaders(request.headers),
    body: request.body === null ? { kind: 'none' } : encodeBytes(await request.arrayBuffer()),
  };
};

/** @throws {TypeError | DOMException} */
const toResponse = (result: unknown, url: string): Response => {
  const parsed = parseBridgeResponse(result);
  if (!parsed.ok) throw parsed.error;
  const response = new Response(decodeBody(parsed.value.body), {
    status: parsed.value.status,
    statusText: parsed.value.statusText,
    headers: parsed.value.headers.map(([key, value]) => [key, value]),
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
};

const awaitBridge = (pending: Promise<unknown>, signal: AbortSignal | null): Promise<unknown> => {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(
      (value: unknown) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
};

/** @throws {TypeError | DOMException} */
export const createTinyFetch = (options: TinyjsFetchOptions = {}): typeof fetch => {
  const origin = bridgeUrl('/', options.origin ?? DEFAULT_TINYJS_ORIGIN).origin;
  return async (input, init) => {
    const request = new Request(typeof input === 'string' ? bridgeUrl(input, origin) : input, init);
    bridgeUrl(request.url, origin);
    const signal = requestSignal(request);
    signal?.throwIfAborted();
    const payload = await toPayload(request, options.feature ?? 'http');
    signal?.throwIfAborted();
    const result = await awaitBridge(
      (options.bridge ?? nativeBridge()).call(TINYJS_FETCH_METHOD, payload),
      signal,
    );
    signal?.throwIfAborted();
    return toResponse(result, request.url);
  };
};

/** @throws {TypeError | DOMException} */
export const tinyFetch: typeof fetch = (input, init) => createTinyFetch()(input, init);
