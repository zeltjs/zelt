import type { Next } from '@zeltjs/core';
import { Middleware, requestContext } from '@zeltjs/core';

@Middleware
export class LoggingMiddleware {
  async use(next: Next) {
    const c = requestContext();
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(`[${c.req.method}] ${c.req.path} ${c.res.status} ${duration}ms`);
    return undefined;
  }
}
