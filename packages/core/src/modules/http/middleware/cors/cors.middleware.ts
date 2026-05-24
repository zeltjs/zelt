import { cors } from 'hono/cors';

import { CorsConfig } from '../../../../built-in-service/http-security/cors.config';
import { inject } from '../../../../kernel/di/inject';
import { Middleware } from '../middleware';
import type { MiddlewareInstance, Next, RequestContext } from '../types';

@Middleware
export class CorsMiddleware implements MiddlewareInstance {
  constructor(private readonly config: CorsConfig = inject(CorsConfig)) {}

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const origin = this.config.origin;
    const hasOrigin = Array.isArray(origin) ? origin.length > 0 : origin !== '';
    if (!hasOrigin) {
      await next();
      return undefined;
    }

    const maxAge = this.config.maxAge;
    await cors({
      origin: this.config.origin,
      allowMethods: this.config.allowMethods,
      allowHeaders: this.config.allowHeaders,
      exposeHeaders: this.config.exposeHeaders,
      ...(maxAge !== undefined && { maxAge }),
      credentials: this.config.credentials,
    })(c, next);
    return undefined;
  }
}
