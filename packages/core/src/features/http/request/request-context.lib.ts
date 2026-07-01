import type { Context, Env, Input } from 'hono';
import {
  createContextKey,
  getInternal,
  setInternal,
  ZeltContextNotAvailableError,
} from '../../../kernel';

type RequestContext = Context<Env, string, Input>;

const HONO_CONTEXT = createContextKey<RequestContext>('zelt:hono');

/** @throws {ZeltContextNotAvailableError} */
export const setHonoContext = (ctx: RequestContext): void => {
  setInternal(HONO_CONTEXT, ctx);
};

/** @throws {ZeltContextNotAvailableError} */
export const requestContext = (): RequestContext => {
  const ctx = getInternal(HONO_CONTEXT);
  if (!ctx)
    throw new ZeltContextNotAvailableError({
      primitive: 'requestContext',
      requiredContext: 'entry',
    });
  return ctx;
};
