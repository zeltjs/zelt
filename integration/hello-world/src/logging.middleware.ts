import type { Next } from '@zeltjs/core';
import { Middleware, requestContext } from '@zeltjs/core';

@Middleware
export class LoggingMiddleware {
  async use(next: Next) {
    const c = requestContext();
    c.header('X-Middleware-Executed', 'true');
    await next();
    return undefined;
  }
}
