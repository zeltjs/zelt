import type { Next } from '@zeltjs/core';
import {
  Middleware,
  MiddlewareWithOptions,
  middlewareOptions,
  requestContext,
  response,
} from '@zeltjs/core';

@Middleware
export class OverrideMiddleware {
  async use(_next: Next) {
    return Response.json('test');
  }
}

@Middleware
export class TransformMiddleware {
  async use(next: Next) {
    await next();
    const c = requestContext();
    const original = await c.res.json();
    return c.json({ data: original });
  }
}

@Middleware
export class StatusMiddleware extends MiddlewareWithOptions<{ statusCode: 200 | 400 | 500 }> {
  async use(next: Next, options = middlewareOptions(StatusMiddleware)) {
    await next();
    const c = requestContext();
    const original = await c.res.json();
    return c.json({ data: original }, options.statusCode);
  }
}

@Middleware
export class HeaderMiddleware extends MiddlewareWithOptions<{
  headerName: string;
  headerValue: string;
}> {
  async use(next: Next, options = middlewareOptions(HeaderMiddleware), res = response()) {
    res.header(options.headerName, options.headerValue);
    await next();
    return undefined;
  }
}
