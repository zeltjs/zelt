import type { Next } from '@zeltjs/core';
import { Middleware, requestContext } from '@zeltjs/core';

@Middleware
export class HelloFromMiddleware {
  async use(_next: Next) {
    const c = requestContext();
    return c.text('Hello from middleware function!');
  }
}
