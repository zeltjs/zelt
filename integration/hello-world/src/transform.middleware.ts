import type { Next } from '@zeltjs/core';
import { Middleware, requestContext } from '@zeltjs/core';

@Middleware
export class TransformMiddleware {
  async use(next: Next) {
    const c = requestContext();
    await next();
    return c.json({ transformed: true });
  }
}

@Middleware
export class HeaderMiddleware {
  async use(next: Next, options: { headerName: string; headerValue: string }) {
    const c = requestContext();
    c.header(options.headerName, options.headerValue);
    await next();
    return undefined;
  }
}
