import type { Next, RequestContext } from '@zeltjs/core';
import { Middleware } from '@zeltjs/core';

@Middleware
export class OverrideMiddleware {
  async use(_c: RequestContext, _next: Next) {
    return Response.json('test');
  }
}

@Middleware
export class TransformMiddleware {
  async use(c: RequestContext, next: Next) {
    await next();
    const original = await c.res.json();
    return c.json({ data: original });
  }
}

@Middleware
export class StatusMiddleware {
  async use(c: RequestContext, next: Next, options: { statusCode: 200 | 400 | 500 }) {
    await next();
    const original = await c.res.json();
    return c.json({ data: original }, options.statusCode);
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
