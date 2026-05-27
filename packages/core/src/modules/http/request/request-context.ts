import type { Context, Env, Input } from 'hono';

import { ZeltContextNotAvailableError } from '../../../kernel/errors';
import { createContextKey, getInternal, setInternal } from '../../../kernel/internal/context-key';

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
