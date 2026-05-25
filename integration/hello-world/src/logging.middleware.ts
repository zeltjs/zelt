import type { Next, RequestContext } from '@zeltjs/core';
import { Middleware } from '@zeltjs/core';

@Middleware
export class LoggingMiddleware {
  async use(c: RequestContext, next: Next) {
    c.header('X-Middleware-Executed', 'true');
    await next();
    return undefined;
  }
}
