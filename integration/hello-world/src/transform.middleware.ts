import type { Next } from '@zeltjs/core';
import { Middleware, MiddlewareWithOptions, optionsOf, response } from '@zeltjs/core';

@Middleware
export class TransformMiddleware {
  async use(next: Next) {
    await next();
    return Response.json({ transformed: true });
  }
}

@Middleware
export class HeaderMiddleware extends MiddlewareWithOptions<{
  headerName: string;
  headerValue: string;
}> {
  async use(next: Next, options = optionsOf(HeaderMiddleware), res = response()) {
    res.header(options.headerName, options.headerValue);
    await next();
    return undefined;
  }
}
