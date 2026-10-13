/** @throws {TypeError} */
const bufferedRequest = (input: Request, bytes: ArrayBuffer | null): Request => {
  const signal = signalOf(input);
  const request = new Request(input.url, {
    method: input.method,
    headers: input.headers,
    body: bytes?.slice(0) ?? null,
    ...(signal ? { signal } : {}),
  });
  Object.defineProperty(request, 'clone', {
    value: (): Request => {
      if (request.bodyUsed || request.body?.locked)
        throw new TypeError('Cannot clone a consumed Request');
      return bufferedRequest(request, bytes);
    },
  });
  return request;
};

const signalOf = (request: Request): AbortSignal | null => request.signal;

/**
 * txiki.js 26.6 clones buffered bodies as streams without duplex and does not tee them.
 * Buffer at the adapter boundary so Zelt can read isolated copies without patching globals.
 * @throws {TypeError} when the incoming body is already consumed
 */
export const prepareTxikiRequest = async (input: Request): Promise<Request> =>
  bufferedRequest(input, input.body === null ? null : await input.arrayBuffer());
