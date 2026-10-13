import { match, P } from 'ts-pattern';
import type {
  AnyHttpReply,
  ContentfulStatusCode,
  HttpStatusCode,
  RedirectStatusCode,
} from './http-reply.types';
import {
  BodyReply,
  EmptyReply,
  JsonReply,
  RedirectReply,
  ReplyData,
  SSEReply,
  StreamReply,
  TextReply,
} from './http-reply-data.lib';

/** @throws {TypeError} */
export const getHttpReply = (value: unknown): AnyHttpReply | undefined => {
  if (value instanceof JsonReply) return value;
  if (!(value instanceof ReplyData)) return undefined;
  return match(value)
    .with(P.instanceOf(JsonReply), (reply) => reply)
    .with(P.instanceOf(TextReply), (reply) => reply)
    .with(P.instanceOf(BodyReply), (reply) => reply)
    .with(P.instanceOf(RedirectReply), (reply) => reply)
    .with(P.instanceOf(EmptyReply), (reply) => reply)
    .with(P.instanceOf(StreamReply), (reply) => reply)
    .with(P.instanceOf(SSEReply), (reply) => reply)
    .otherwise(() => {
      throw new TypeError('Unknown HTTP reply data variant.');
    });
};

/** @throws {TypeError} */
export const contentfulStatus = (status: HttpStatusCode): ContentfulStatusCode => {
  if (!Number.isInteger(status) || status < 200 || status > 599)
    throw new TypeError('Invalid HTTP reply status.');
  if (status === 204 || status === 205 || status === 304)
    throw new TypeError('A bodyless HTTP status cannot carry a body.');
  return status;
};

/** @throws {TypeError} */
export const redirectStatus = (status: HttpStatusCode): RedirectStatusCode =>
  match(status)
    .with(P.union(301, 302, 303, 307, 308), (value) => value)
    .otherwise(() => {
      throw new TypeError('Invalid redirect status.');
    });
