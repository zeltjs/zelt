import { deleteCookie, setCookie } from 'hono/cookie';
import { stream, streamSSE, streamText } from 'hono/streaming';
import { match, P } from 'ts-pattern';

import type { RequestContext } from '../middleware/middleware.types';
import { getHttpReply } from './http-reply.lib';
import type { AnyHttpReply, ResponseHeaderOperation } from './http-reply.types';
import {
  BodyReply,
  EmptyReply,
  JsonReply,
  RedirectReply,
  SSEReply,
  StreamReply,
  TextReply,
} from './http-reply-data.lib';
import { ResponseBuilder } from './response.lib';
import { trackGeneratedResponse } from './response-ownership.lib';

/** @throws {TypeError} */
const renderBody = (
  ctx: RequestContext,
  reply: Extract<AnyHttpReply, { format: 'body' }>,
): Response => {
  // Hono's body overloads cover fewer BodyInit variants than its runtime accepts.
  const result: unknown = Reflect.apply(ctx.body, ctx, [reply.body, reply.status]);
  if (!(result instanceof Response))
    throw new TypeError('HTTP body renderer did not return a Response.');
  return result;
};

const applyHeaderOperation = (ctx: RequestContext, operation: ResponseHeaderOperation): void => {
  if (operation.kind === 'header') {
    ctx.header(operation.name, operation.value, { append: operation.append });
    return;
  }
  match(operation)
    .with({ kind: 'remove-header' }, (op) => ctx.header(op.name, undefined))
    .with({ kind: 'cookie' }, (op) => setCookie(ctx, op.name, op.value, op.options))
    .with({ kind: 'delete-cookie' }, (op) => {
      deleteCookie(ctx, op.name, op.options);
    })
    .exhaustive();
};

const renderStream = (
  ctx: RequestContext,
  reply: Extract<AnyHttpReply, { format: 'stream' | 'streamText' | 'sse' }>,
): Response => {
  ctx.status(reply.status);
  return match(reply)
    .with({ format: 'stream' }, (value) => stream(ctx, value.body.run, value.body.onError))
    .with({ format: 'streamText' }, (value) => streamText(ctx, value.body.run, value.body.onError))
    .with({ format: 'sse' }, (value) => streamSSE(ctx, value.body.run, value.body.onError))
    .exhaustive();
};

/** @throws {TypeError} */
export const renderHttpReply = (ctx: RequestContext, reply: AnyHttpReply): Response => {
  for (const operation of reply.headerOperations) applyHeaderOperation(ctx, operation);
  if (reply.format === 'json')
    return trackGeneratedResponse(ctx, ctx.json(reply.body, reply.status, reply.headers));
  const result = match(reply)
    .with({ format: 'text' }, (value) => ctx.text(value.body, value.status))
    .with({ format: 'body' }, (value) => renderBody(ctx, value))
    .with({ format: 'redirect' }, (value) => ctx.redirect(value.body, value.status))
    .with({ format: 'empty' }, (value) => ctx.newResponse(null, { status: value.status }))
    .with({ format: 'stream' }, { format: 'streamText' }, { format: 'sse' }, (value) =>
      renderStream(ctx, value),
    )
    .exhaustive();
  return trackGeneratedResponse(ctx, result);
};

/** @throws {TypeError} */
export const renderReplyResult = (
  ctx: RequestContext,
  result: Response | AnyHttpReply | undefined,
): Response | undefined => {
  if (result === undefined) return undefined;
  return match(result)
    .with(
      P.union(
        P.instanceOf(JsonReply),
        P.instanceOf(TextReply),
        P.instanceOf(BodyReply),
        P.instanceOf(RedirectReply),
        P.instanceOf(EmptyReply),
        P.instanceOf(StreamReply),
        P.instanceOf(SSEReply),
      ),
      (reply) => renderHttpReply(ctx, reply),
    )
    .otherwise((nativeResponse) => nativeResponse);
};

/** @throws {TypeError} */
export const renderControllerResult = (ctx: RequestContext, result: unknown): Response => {
  const reply = getHttpReply(result);
  if (reply) return renderHttpReply(ctx, reply);
  if (result instanceof ResponseBuilder)
    throw new TypeError(
      'Finish the response() builder with json(), text(), body(), redirect(), empty(), or a stream method.',
    );
  if (
    result instanceof Response ||
    Object.prototype.toString.call(result) === '[object Response]'
  ) {
    throw new TypeError(
      'Controllers must return JSON data or response() reply data, not a native Response.',
    );
  }
  return trackGeneratedResponse(ctx, ctx.json(result));
};
