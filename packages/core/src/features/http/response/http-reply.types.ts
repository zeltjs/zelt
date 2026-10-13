export type HttpStatusCode =
  | 200
  | 201
  | 202
  | 203
  | 204
  | 205
  | 206
  | 207
  | 208
  | 226
  | 300
  | 301
  | 302
  | 303
  | 304
  | 305
  | 306
  | 307
  | 308
  | 400
  | 401
  | 402
  | 403
  | 404
  | 405
  | 406
  | 407
  | 408
  | 409
  | 410
  | 411
  | 412
  | 413
  | 414
  | 415
  | 416
  | 417
  | 418
  | 421
  | 422
  | 423
  | 424
  | 425
  | 426
  | 428
  | 429
  | 431
  | 451
  | 500
  | 501
  | 502
  | 503
  | 504
  | 505
  | 506
  | 507
  | 508
  | 510
  | 511;

export type EmptyStatusCode = 204 | 205 | 304;
export type ContentfulStatusCode = Exclude<HttpStatusCode, EmptyStatusCode>;
export type RedirectStatusCode = 301 | 302 | 303 | 307 | 308;

export type CookieOptions = {
  readonly domain?: string;
  readonly expires?: Date;
  readonly httpOnly?: boolean;
  readonly maxAge?: number;
  readonly path?: string;
  readonly secure?: boolean;
  readonly sameSite?: 'Strict' | 'Lax' | 'None';
};

export type HeaderOptions = { readonly type?: 'override' | 'append' };

export type ResponseHeaderOperation =
  | {
      kind: 'header';
      readonly name: string;
      readonly value: string;
      readonly append: boolean;
    }
  | { kind: 'remove-header'; readonly name: string }
  | {
      kind: 'cookie';
      readonly name: string;
      readonly value: string;
      readonly options: CookieOptions;
    }
  | { kind: 'delete-cookie'; readonly name: string; readonly options: CookieOptions };

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
  readonly data: string | Promise<string>;
  readonly event?: string;
  readonly id?: string;
  readonly retry?: number;
};

export type ZeltSSEWriter = ZeltStreamWriter & {
  writeSSE(message: ZeltSSEMessage): Promise<void>;
};

export type StreamBody<Writer = ZeltStreamWriter> = {
  readonly run: (writer: Writer) => Promise<void>;
  readonly onError: ((error: Error, writer: Writer) => Promise<void>) | undefined;
};

export type HttpReplyFormat =
  | 'json'
  | 'text'
  | 'body'
  | 'redirect'
  | 'empty'
  | 'stream'
  | 'streamText'
  | 'sse';

export const HTTP_REPLY_BRAND: unique symbol = Symbol('zelt:http-reply');

export type HttpReply<T, S extends HttpStatusCode = 200, F extends HttpReplyFormat = 'json'> = {
  [HTTP_REPLY_BRAND]: true;
  readonly status: S;
  readonly format: F;
  readonly body: T;
  readonly headerOperations: readonly ResponseHeaderOperation[];
  readonly headers?: Readonly<Record<string, string>> | undefined;
};

export type TypedResponse<
  T,
  S extends HttpStatusCode = 200,
  F extends HttpReplyFormat = 'json',
> = HttpReply<T, S, F>;

export type AnyHttpReply =
  | HttpReply<unknown, ContentfulStatusCode, 'json'>
  | HttpReply<string, ContentfulStatusCode, 'text'>
  | HttpReply<BodyInit, ContentfulStatusCode, 'body'>
  | HttpReply<string, RedirectStatusCode, 'redirect'>
  | HttpReply<undefined, HttpStatusCode, 'empty'>
  | HttpReply<StreamBody, ContentfulStatusCode, 'stream' | 'streamText'>
  | HttpReply<StreamBody<ZeltSSEWriter>, ContentfulStatusCode, 'sse'>;
