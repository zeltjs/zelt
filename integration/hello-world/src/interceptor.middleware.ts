import type { Next } from '@zeltjs/core';
import { Middleware, requestContext } from '@zeltjs/core';

@Middleware
export class OverrideMiddleware {
  async use(_next: Next) {
    return Response.json('test');
  }
}

@Middleware
export class TransformMiddleware {
  async use(next: Next) {
    const c = requestContext();
    await next();
    const original = await c.res.json();
    return c.json({ data: original });
  }
}

@Middleware
export class StatusMiddleware {
  async use(next: Next, options: { statusCode: 200 | 400 | 500 }) {
    const c = requestContext();
    await next();
    const original = await c.res.json();
    return c.json({ data: original }, options.statusCode);
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
