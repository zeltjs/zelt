import {
  createContextKey,
  getInternal,
  setInternal,
  ZeltContextNotAvailableError,
} from '../../../../kernel';
import type { RequestContext } from '../../middleware/middleware.types';

const HONO_CONTEXT = /* @__PURE__ */ createContextKey<RequestContext>('zelt:hono');

/** @throws {ZeltContextNotAvailableError} */
export const setHonoContext = (ctx: RequestContext): void => {
  setInternal(HONO_CONTEXT, ctx);
};

/** @throws {ZeltContextNotAvailableError} */
export const getHonoContext = (): RequestContext => {
  const ctx = getInternal(HONO_CONTEXT);
  if (!ctx)
    throw new ZeltContextNotAvailableError({
      primitive: 'requestContext',
      requiredContext: 'entry',
    });
  return ctx;
};
