import type {
  ContentfulStatusCode,
  HttpReply,
  HttpReplyFormat,
  HttpStatusCode,
  RedirectStatusCode,
  ResponseHeaderOperation,
  StreamBody,
  ZeltSSEWriter,
} from './http-reply.types';
import { HTTP_REPLY_BRAND } from './http-reply.types';

export abstract class ReplyData<T, S extends HttpStatusCode, F extends HttpReplyFormat>
  implements HttpReply<T, S, F>
{
  get [HTTP_REPLY_BRAND](): true {
    return true;
  }

  constructor(
    readonly status: S,
    readonly format: F,
    readonly body: T,
    readonly headerOperations: readonly ResponseHeaderOperation[],
    readonly headers?: Readonly<Record<string, string>>,
  ) {}
}

export class JsonReply<T, S extends ContentfulStatusCode> extends ReplyData<T, S, 'json'> {
  constructor(
    status: S,
    body: T,
    operations: readonly ResponseHeaderOperation[],
    headers?: Record<string, string>,
  ) {
    super(status, 'json', body, operations, headers ? { ...headers } : undefined);
  }
}

export class TextReply<T extends string, S extends ContentfulStatusCode> extends ReplyData<
  T,
  S,
  'text'
> {
  constructor(status: S, body: T, operations: readonly ResponseHeaderOperation[]) {
    super(status, 'text', body, operations);
  }
}

export class BodyReply<T extends BodyInit, S extends ContentfulStatusCode> extends ReplyData<
  T,
  S,
  'body'
> {
  constructor(status: S, body: T, operations: readonly ResponseHeaderOperation[]) {
    super(status, 'body', body, operations);
  }
}

export class RedirectReply<S extends RedirectStatusCode> extends ReplyData<string, S, 'redirect'> {
  constructor(status: S, url: string, operations: readonly ResponseHeaderOperation[]) {
    super(status, 'redirect', url, operations);
  }
}

export class EmptyReply<S extends HttpStatusCode> extends ReplyData<undefined, S, 'empty'> {
  constructor(status: S, operations: readonly ResponseHeaderOperation[]) {
    super(status, 'empty', undefined, operations);
  }
}

export class StreamReply<
  S extends ContentfulStatusCode,
  F extends 'stream' | 'streamText',
> extends ReplyData<StreamBody, S, F> {}

export class SSEReply<S extends ContentfulStatusCode> extends ReplyData<
  StreamBody<ZeltSSEWriter>,
  S,
  'sse'
> {
  constructor(
    status: S,
    body: StreamBody<ZeltSSEWriter>,
    operations: readonly ResponseHeaderOperation[],
  ) {
    super(status, 'sse', body, operations);
  }
}
