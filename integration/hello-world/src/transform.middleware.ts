import type { Next, RequestContext } from '@zeltjs/core';
import { Middleware } from '@zeltjs/core';

@Middleware
export class TransformMiddleware {
  async use(c: RequestContext, next: Next) {
    await next();
    return c.json({ transformed: true });
  }
}

@Middleware
export class HeaderMiddleware {
  async use(c: RequestContext, next: Next, options: { headerName: string; headerValue: string }) {
    c.header(options.headerName, options.headerValue);
    await next();
    return undefined;
  }
}
