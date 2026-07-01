import type { Next } from '@zeltjs/core';
import { Middleware, requestContext, response } from '@zeltjs/core';

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
export class StatusMiddleware {
  async use(next: Next, options: { statusCode: 200 | 400 | 500 }) {
    await next();
    const c = requestContext();
    const original = await c.res.json();
    return c.json({ data: original }, options.statusCode);
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
