import type { Context, TypedResponse } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { stream, streamSSE, streamText } from 'hono/streaming';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type { TypedResponse };

export type ZeltStreamWriter = {
  readonly aborted: boolean;
  readonly closed: boolean;
  write(input: Uint8Array | string): Promise<ZeltStreamWriter>;
  writeln(input: string): Promise<ZeltStreamWriter>;
  sleep(ms: number): Promise<unknown>;
  close(): Promise<void>;
  pipe(body: ReadableStream): Promise<void>;
  onAbort(listener: () => void | Promise<void>): void;
  abort(): void;
};

export type ZeltSSEMessage = {
  data: string | Promise<string>;
  event?: string;
  id?: string;
  retry?: number;
};

export type ZeltSSEWriter = ZeltStreamWriter & {
  writeSSE(message: ZeltSSEMessage): Promise<void>;
};

import { requestContext } from '../request';

// zelt は 300 multi-choice / 304 not-modified / 305-306 deprecated を除外し、
// AppType / OpenAPI consumer 向けに本物の redirect 3xx だけに narrow する。
type KoyaRedirectStatusCode = 301 | 302 | 303 | 307 | 308;

export type CookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

export type ResponseBuilder = {
  json<T, S extends ContentfulStatusCode = 200>(
    data: T,
    status?: S,
    headers?: Record<string, string>,
  ): TypedResponse<T, S, 'json'>;

  redirect<S extends KoyaRedirectStatusCode = 302>(
    url: string,
    status?: S,
  ): TypedResponse<undefined, S, 'redirect'>;

  text<T extends string, S extends ContentfulStatusCode = 200>(
    data: T,
    status?: S,
  ): TypedResponse<T, S, 'text'>;

  body<T extends BodyInit, S extends ContentfulStatusCode = 200>(
    data: T,
    status?: S,
  ): TypedResponse<T, S, 'body'>;

  header(name: string, value: string): ResponseBuilder;

  setCookie(name: string, value: string, options?: CookieOptions): ResponseBuilder;

  deleteCookie(name: string, options?: CookieOptions): ResponseBuilder;

  stream(
    cb: (stream: ZeltStreamWriter) => Promise<void>,
    onError?: (e: Error, stream: ZeltStreamWriter) => Promise<void>,
  ): Response;

  streamText(
    cb: (stream: ZeltStreamWriter) => Promise<void>,
    onError?: (e: Error, stream: ZeltStreamWriter) => Promise<void>,
  ): Response;

  sse(
    cb: (stream: ZeltSSEWriter) => Promise<void>,
    onError?: (e: Error, stream: ZeltSSEWriter) => Promise<void>,
  ): Response;
};

// Minimal structural view of hono Context for building responses.
type ResponseContext = Pick<Context, 'json' | 'redirect' | 'text' | 'body' | 'header'>;

// Function overloads declare the public contract; the implementation signature is
// intentionally wider so that delegation to hono's overloaded methods type-checks
// without requiring an `as` assertion on the return value.
function makeJson(c: ResponseContext): ResponseBuilder['json'] {
  function json<T, S extends ContentfulStatusCode = 200>(
    data: T,
    status?: S,
    headers?: Record<string, string>,
  ): TypedResponse<T, S, 'json'>;
  function json(data: unknown, status?: ContentfulStatusCode, headers?: Record<string, string>) {
    return c.json(data, status, headers);
  }
  return json;
}

function makeRedirect(c: ResponseContext): ResponseBuilder['redirect'] {
  function redirect<S extends KoyaRedirectStatusCode = 302>(
    url: string,
    status?: S,
  ): TypedResponse<undefined, S, 'redirect'>;
  function redirect(url: string, status?: KoyaRedirectStatusCode) {
    return c.redirect(url, status);
  }
  return redirect;
}

function makeText(c: ResponseContext): ResponseBuilder['text'] {
  function text<T extends string, S extends ContentfulStatusCode = 200>(
    data: T,
    status?: S,
  ): TypedResponse<T, S, 'text'>;
  function text(data: string, status?: ContentfulStatusCode) {
    return c.text(data, status);
  }
  return text;
}

function makeBody(c: ResponseContext): ResponseBuilder['body'] {
  function body<T extends BodyInit, S extends ContentfulStatusCode = 200>(
    data: T,
    status?: S,
  ): TypedResponse<T, S, 'body'>;
  function body(data: string | ArrayBuffer | ReadableStream, status?: ContentfulStatusCode) {
    return c.body(data, status);
  }
  return body;
}

const buildResponseBuilder = (c: Context): ResponseBuilder => {
  const builder: ResponseBuilder = {
    json: makeJson(c),
    redirect: makeRedirect(c),
    text: makeText(c),
    body: makeBody(c),
    header: (name, value) => {
      c.header(name, value);
      return builder;
    },
    setCookie: (name, value, options) => {
      setCookie(c, name, value, options);
      return builder;
    },
    deleteCookie: (name, options) => {
      deleteCookie(c, name, options);
      return builder;
    },
    stream: (cb, onError) => stream(c, cb, onError),
    streamText: (cb, onError) => streamText(c, cb, onError),
    sse: (cb, onError) => streamSSE(c, cb, onError),
  };
  return builder;
};

/** @throws {ZeltContextNotAvailableError} */
export const response = (): ResponseBuilder => {
  return buildResponseBuilder(requestContext());
};
