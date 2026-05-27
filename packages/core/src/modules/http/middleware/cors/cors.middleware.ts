import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { inject } from '../../../../kernel/di/inject';
import { requestContext } from '../../request/request-context';
import { Middleware } from '../middleware';
import type { MiddlewareInstance, Next } from '../types';
import { CorsConfig } from './cors.config';

@Middleware
export class CorsMiddleware implements MiddlewareInstance {
  private readonly middleware: MiddlewareHandler | undefined;

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

  /** @throws {ZeltContextNotAvailableError} */
  async use(next: Next): Promise<Response | undefined> {
    if (!this.middleware) {
      await next();
      return undefined;
    }
    const res = await this.middleware(requestContext(), next);
    return res ?? undefined;
  }
}
