import type { Next } from '@zeltjs/core';
import { Middleware, responseHeaders } from '@zeltjs/core';

@Middleware
export class LoggingMiddleware {
  async use(next: Next, headers = responseHeaders()) {
    headers.set('X-Middleware-Executed', 'true');
    await next();
    return undefined;
  }
}
