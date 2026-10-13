import { contentfulStatus, redirectStatus } from './http-reply.lib';
import type {
  ContentfulStatusCode,
  CookieOptions,
  HeaderOptions,
  HttpReply,
  HttpStatusCode,
  RedirectStatusCode,
  ResponseHeaderOperation,
  StreamBody,
  ZeltSSEWriter,
  ZeltStreamWriter,
} from './http-reply.types';
import {
  BodyReply,
  EmptyReply,
  JsonReply,
  RedirectReply,
  SSEReply,
  StreamReply,
  TextReply,
} from './http-reply-data.lib';

export type {
  CookieOptions,
  HeaderOptions,
  HttpReply,
  HttpReplyFormat,
  HttpStatusCode,
  TypedResponse,
  ZeltSSEMessage,
  ZeltSSEWriter,
  ZeltStreamWriter,
} from './http-reply.types';

type BuilderState<S extends HttpStatusCode> = {
  readonly status: S;
  readonly headerOperations: readonly ResponseHeaderOperation[];
};

type DefaultRedirectStatus<S extends HttpStatusCode> = S extends RedirectStatusCode ? S : 302;

/** @throws {TypeError} */
const assertStatus = (status: HttpStatusCode): void => {
  if (!Number.isInteger(status) || status < 200 || status > 599) {
    throw new TypeError('HTTP reply status must be an integer between 200 and 599.');
  }
};

export class ResponseBuilder<S extends HttpStatusCode = 200> {
  constructor(private readonly state: BuilderState<S>) {}

  /** @throws {TypeError} */
  status<N extends HttpStatusCode>(status: N): ResponseBuilder<N> {
    assertStatus(status);
    return new ResponseBuilder({ status, headerOperations: this.state.headerOperations });
  }

  header(name: string, value: string, options?: HeaderOptions): ResponseBuilder<S> {
    return this.withHeader({ kind: 'header', name, value, append: options?.type === 'append' });
  }

  removeHeader(name: string): ResponseBuilder<S> {
    return this.withHeader({ kind: 'remove-header', name });
  }

  setCookie(name: string, value: string, options: CookieOptions = {}): ResponseBuilder<S> {
    return this.withHeader({ kind: 'cookie', name, value, options: { ...options } });
  }

  deleteCookie(name: string, options: CookieOptions = {}): ResponseBuilder<S> {
    return this.withHeader({ kind: 'delete-cookie', name, options: { ...options } });
  }

  json<T>(
    this: ResponseBuilder<ContentfulStatusCode>,
    data: T,
    status?: undefined,
    headers?: Record<string, string>,
  ): HttpReply<T, Extract<S, ContentfulStatusCode>, 'json'>;
  json<T, N extends ContentfulStatusCode>(
    data: T,
    status: N,
    headers?: Record<string, string>,
  ): HttpReply<T, N, 'json'>;
  /** @throws {TypeError} */
  json<T>(
    data: T,
    status?: ContentfulStatusCode,
    headers?: Record<string, string>,
  ): HttpReply<T, ContentfulStatusCode, 'json'> {
    return new JsonReply(
      contentfulStatus(status ?? this.state.status),
      data,
      this.state.headerOperations,
      headers,
    );
  }

  text<T extends string>(
    this: ResponseBuilder<ContentfulStatusCode>,
    data: T,
    status?: undefined,
  ): HttpReply<T, Extract<S, ContentfulStatusCode>, 'text'>;
  text<T extends string, N extends ContentfulStatusCode>(
    data: T,
    status: N,
  ): HttpReply<T, N, 'text'>;
  /** @throws {TypeError} */
  text<T extends string>(
    data: T,
    status?: ContentfulStatusCode,
  ): HttpReply<T, ContentfulStatusCode, 'text'> {
    return new TextReply(
      contentfulStatus(status ?? this.state.status),
      data,
      this.state.headerOperations,
    );
  }

  body<T extends BodyInit>(
    this: ResponseBuilder<ContentfulStatusCode>,
    data: T,
    status?: undefined,
  ): HttpReply<T, Extract<S, ContentfulStatusCode>, 'body'>;
  body<T extends BodyInit, N extends ContentfulStatusCode>(
    data: T,
    status: N,
  ): HttpReply<T, N, 'body'>;
  /** @throws {TypeError} */
  body<T extends BodyInit>(
    data: T,
    status?: ContentfulStatusCode,
  ): HttpReply<T, ContentfulStatusCode, 'body'> {
    return new BodyReply(
      contentfulStatus(status ?? this.state.status),
      data,
      this.state.headerOperations,
    );
  }

  redirect(
    this: ResponseBuilder<200 | RedirectStatusCode>,
    url: string,
    status?: undefined,
  ): HttpReply<string, DefaultRedirectStatus<S>, 'redirect'>;
  redirect<N extends RedirectStatusCode>(url: string, status: N): HttpReply<string, N, 'redirect'>;
  /** @throws {TypeError} */
  redirect(
    url: string,
    status?: RedirectStatusCode,
  ): HttpReply<string, RedirectStatusCode, 'redirect'> {
    const selected =
      status ?? (this.state.status === 200 ? 302 : redirectStatus(this.state.status));
    return new RedirectReply(redirectStatus(selected), url, this.state.headerOperations);
  }

  empty(): HttpReply<undefined, S, 'empty'>;
  empty<N extends HttpStatusCode>(status: N): HttpReply<undefined, N, 'empty'>;
  /** @throws {TypeError} */
  empty(status: HttpStatusCode = this.state.status): HttpReply<undefined, HttpStatusCode, 'empty'> {
    assertStatus(status);
    return new EmptyReply(status, this.state.headerOperations);
  }

  stream(
    this: ResponseBuilder<ContentfulStatusCode>,
    run: (writer: ZeltStreamWriter) => Promise<void>,
    onError?: (error: Error, writer: ZeltStreamWriter) => Promise<void>,
  ): HttpReply<StreamBody, Extract<S, ContentfulStatusCode>, 'stream'>;
  /** @throws {TypeError} */
  stream(
    run: (writer: ZeltStreamWriter) => Promise<void>,
    onError?: (error: Error, writer: ZeltStreamWriter) => Promise<void>,
  ): HttpReply<StreamBody, ContentfulStatusCode, 'stream'> {
    return new StreamReply(
      contentfulStatus(this.state.status),
      'stream',
      { run, onError },
      this.state.headerOperations,
    );
  }

  streamText(
    this: ResponseBuilder<ContentfulStatusCode>,
    run: (writer: ZeltStreamWriter) => Promise<void>,
    onError?: (error: Error, writer: ZeltStreamWriter) => Promise<void>,
  ): HttpReply<StreamBody, Extract<S, ContentfulStatusCode>, 'streamText'>;
  /** @throws {TypeError} */
  streamText(
    run: (writer: ZeltStreamWriter) => Promise<void>,
    onError?: (error: Error, writer: ZeltStreamWriter) => Promise<void>,
  ): HttpReply<StreamBody, ContentfulStatusCode, 'streamText'> {
    return new StreamReply(
      contentfulStatus(this.state.status),
      'streamText',
      { run, onError },
      this.state.headerOperations,
    );
  }

  sse(
    this: ResponseBuilder<ContentfulStatusCode>,
    run: (writer: ZeltSSEWriter) => Promise<void>,
    onError?: (error: Error, writer: ZeltSSEWriter) => Promise<void>,
  ): HttpReply<StreamBody<ZeltSSEWriter>, Extract<S, ContentfulStatusCode>, 'sse'>;
  /** @throws {TypeError} */
  sse(
    run: (writer: ZeltSSEWriter) => Promise<void>,
    onError?: (error: Error, writer: ZeltSSEWriter) => Promise<void>,
  ): HttpReply<StreamBody<ZeltSSEWriter>, ContentfulStatusCode, 'sse'> {
    return new SSEReply(
      contentfulStatus(this.state.status),
      { run, onError },
      this.state.headerOperations,
    );
  }

  private withHeader(operation: ResponseHeaderOperation): ResponseBuilder<S> {
    return new ResponseBuilder({
      status: this.state.status,
      headerOperations: [...this.state.headerOperations, operation],
    });
  }
}

export const response = (): ResponseBuilder =>
  new ResponseBuilder({ status: 200, headerOperations: [] });
