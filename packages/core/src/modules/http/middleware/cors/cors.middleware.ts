import { cors } from 'hono/cors';
import { inject } from '../../../../kernel/di/inject';
import { Middleware } from '../middleware';
import type { FunctionMiddleware, MiddlewareInstance, Next, RequestContext } from '../types';
import { CorsConfig } from './cors.config';

@Middleware
export class CorsMiddleware implements MiddlewareInstance {
  private readonly middleware: FunctionMiddleware | undefined;

  constructor(config: CorsConfig = inject(CorsConfig)) {
    const origin = config.origin;
    const hasOrigin = Array.isArray(origin) ? origin.length > 0 : origin !== '';
    if (!hasOrigin) {
      this.middleware = undefined;
      return;
    }

    const maxAge = config.maxAge;
    this.middleware = cors({
      origin: config.origin,
      allowMethods: config.allowMethods,
      allowHeaders: config.allowHeaders,
      exposeHeaders: config.exposeHeaders,
      ...(maxAge !== undefined && { maxAge }),
      credentials: config.credentials,
    });
  }

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    if (!this.middleware) {
      await next();
      return undefined;
    }
    await this.middleware(c, next);
    return undefined;
  }
}
