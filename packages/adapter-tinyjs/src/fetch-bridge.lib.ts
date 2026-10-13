import { bridgeUrl, collectHeaders, decodeBody, encodeBytes, parseBridgeRequest } from './shared';
import type { TinyjsFetchRequest, TinyjsFetchResponse } from './shared/bridge.types';

const NO_BODY_STATUSES = new Set([204, 205, 304]);

export type TinyjsFetchHandler = (payload: unknown) => Promise<TinyjsFetchResponse>;

/** @throws {TypeError | DOMException} */
const toRequest = (input: TinyjsFetchRequest, origin: string): Request => {
  const method = input.method.toUpperCase();
  if ((method === 'GET' || method === 'HEAD') && input.body.kind !== 'none') {
    throw new TypeError(`${method} cannot carry a request body`);
  }
  return new Request(bridgeUrl(input.path, origin), {
    method,
    headers: input.headers.map(([key, value]) => [key, value]),
    body: decodeBody(input.body),
  });
};

/** @throws {TypeError | DOMException} from the returned Fetch handler */
export const createFetchBridge =
  (
    fetchers: ReadonlyMap<string, (request: Request) => Promise<Response>>,
    origin: string,
  ): TinyjsFetchHandler =>
  async (payload) => {
    const parsed = parseBridgeRequest(payload);
    if (!parsed.ok) throw parsed.error;
    const input = parsed.value;
    const fetch = fetchers.get(input.feature);
    if (!fetch)
      throw new TypeError(`HTTP feature "${input.feature}" is not exposed by this tinyjs app`);
    const request = toRequest(input, origin);
    const response = await fetch(request);
    return {
      status: response.status,
      statusText: response.statusText,
      headers: collectHeaders(response.headers),
      body:
        request.method === 'HEAD' || NO_BODY_STATUSES.has(response.status)
          ? { kind: 'none' }
          : encodeBytes(await response.arrayBuffer()),
    };
  };
