import type { Context } from 'hono';

import { ZeltContextNotAvailableError } from '../../../kernel/errors';
import { createContextKey, getInternal, setInternal } from '../../../kernel/internal/context-key';

const HONO_CONTEXT = createContextKey<Context>('zelt:hono');

/** @throws {ZeltContextNotAvailableError} */
export const setHonoContext = (ctx: Context): void => {
  setInternal(HONO_CONTEXT, ctx);
};

/** @throws {ZeltContextNotAvailableError} */
export const requestContext = (): Context => {
  const ctx = getInternal(HONO_CONTEXT);
  if (!ctx)
    throw new ZeltContextNotAvailableError({
      primitive: 'requestContext',
      requiredContext: 'request',
    });
  return ctx;
};
