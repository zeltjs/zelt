import type { Next, RequestContext } from '@zeltjs/core';
import { inject, LoggerService, Middleware } from '@zeltjs/core';

@Middleware
export class LoggingMiddleware {
  constructor(private readonly logger = inject(LoggerService)) {}

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const start = performance.now();
    await next();
    const duration = Math.round(performance.now() - start);

    this.logger.info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
    });

    return undefined;
  }
}
