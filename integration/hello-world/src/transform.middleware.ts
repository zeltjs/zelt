import type { Next } from '@zeltjs/core';
import { Middleware, response } from '@zeltjs/core';

@Middleware
export class TransformMiddleware {
  async use(next: Next) {
    await next();
    return Response.json({ transformed: true });
  }
}

@Middleware
export class HeaderMiddleware {
  async use(next: Next, options: { headerName: string; headerValue: string }, res = response()) {
    res.header(options.headerName, options.headerValue);
    await next();
    return undefined;
  }
}
