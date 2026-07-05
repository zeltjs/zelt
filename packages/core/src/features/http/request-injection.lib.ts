import { createContextKey, getInternal, setInternal } from '../../kernel';
import type { HonoMiddleware } from './middleware/middleware.types';
import { setHonoContext } from './request';
import { setBodySource, setPathParams } from './request/injection';

const REQUEST_INJECTED = createContextKey<true>('zelt:request-injected');

// Runs right after the bootstrap middleware, ahead of the router-level
// (security and user) middlewares, so request helpers like body() / header()
// / pathParam() work inside them. Only the outermost router performs the
// injection; nested routers stay transparent. Path params are re-applied per
// matched route by the route-level injection for accuracy under nesting.
/** @throws {ZeltContextNotAvailableError | BadRequestException} */
export const createRequestInjectionMiddleware = (): HonoMiddleware => {
  return async (c, next) => {
    if (getInternal(REQUEST_INJECTED)) {
      await next();
      return;
    }
    setInternal(REQUEST_INJECTED, true);
    setHonoContext(c);
    setBodySource({
      contentType: c.req.header('content-type') ?? '',
      request: c.req.raw.clone(),
    });
    setPathParams(c.req.param());
    await next();
  };
};
