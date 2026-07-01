import type { Next } from '@zeltjs/core';
import { Middleware, response } from '@zeltjs/core';

@Middleware
export class LoggingMiddleware {
  async use(next: Next, res = response()) {
    res.header('X-Middleware-Executed', 'true');
    await next();
    return undefined;
  }
}
