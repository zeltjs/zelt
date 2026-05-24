import type { Context } from 'hono';

import { ZeltContextNotAvailableError } from '../../../kernel/errors';
import { createContextKey, getInternal } from '../../../kernel/internal/context-key';

type FormBody = Record<string, string | File | (string | File)[]>;

type ParsedBody =
  | { type: 'json'; val: unknown }
  | { type: 'form'; val: FormBody }
  | { type: 'text'; val: string }
  | { type: 'none'; val: undefined };

export type HttpContextValue = {
  readonly body: ParsedBody;
  readonly pathParams: Readonly<Record<string, string>>;
  readonly honoContext: Context;
};

export const HTTP_CONTEXT = createContextKey<HttpContextValue>('zelt:http');

/** @throws {ZeltContextNotAvailableError} */
export const getHttpContext = (): HttpContextValue => {
  const ctx = getInternal(HTTP_CONTEXT);
  if (!ctx)
    throw new ZeltContextNotAvailableError({
      primitive: 'getHttpContext',
      requiredContext: 'request',
    });
  return ctx;
};

export type AuthContextValue = {
  readonly user: unknown;
  readonly roles: readonly string[];
};

export const AUTH_CONTEXT = createContextKey<AuthContextValue>('zelt:auth');
