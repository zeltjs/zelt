import type { Next } from '@zeltjs/core';
import {
  Middleware,
  MiddlewareWithOptions,
  middlewareOptions,
  responseHeaders,
} from '@zeltjs/core';

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
  async use(
    next: Next,
    options = middlewareOptions(HeaderMiddleware),
    headers = responseHeaders(),
  ) {
    headers.set(options.headerName, options.headerValue);
    await next();
    return undefined;
  }
}
