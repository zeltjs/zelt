import type { Next } from '@zeltjs/core';
import { inject, LoggerService, Middleware, request, requestContext } from '@zeltjs/core';

@Middleware
export class LoggingMiddleware {
  constructor(private readonly logger = inject(LoggerService)) {}

  async use(next: Next, req = request()): Promise<Response | undefined> {
    const start = performance.now();
    await next();
    const duration = Math.round(performance.now() - start);
    const c = requestContext();

    this.logger.info('request', {
      method: req.method(),
      path: req.path(),
      status: c.res.status,
      duration,
    });

    return undefined;
  }
}
