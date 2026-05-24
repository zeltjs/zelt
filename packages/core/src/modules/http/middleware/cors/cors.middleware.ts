import { cors } from 'hono/cors';

import { CorsConfig } from '../../../../built-in-service/http-security/cors.config';
import { inject } from '../../../../kernel/di/inject';
import { Middleware } from '../middleware';
import type { FunctionMiddleware, MiddlewareInstance, Next, RequestContext } from '../types';

@Middleware
export class CorsMiddleware implements MiddlewareInstance {
  private readonly honoMiddleware: FunctionMiddleware | undefined;

  constructor(config: CorsConfig = inject(CorsConfig)) {
    const origin = config.origin;
    const hasOrigin = Array.isArray(origin) ? origin.length > 0 : origin !== '';
    if (!hasOrigin) {
      this.honoMiddleware = undefined;
      return;
    }

    const maxAge = config.maxAge;
    this.honoMiddleware = cors({
      origin: config.origin,
      allowMethods: config.allowMethods,
      allowHeaders: config.allowHeaders,
      exposeHeaders: config.exposeHeaders,
      ...(maxAge !== undefined && { maxAge }),
      credentials: config.credentials,
    });
  }

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    if (!this.honoMiddleware) {
      await next();
      return undefined;
    }
    await this.honoMiddleware(c, next);
    return undefined;
  }
}
