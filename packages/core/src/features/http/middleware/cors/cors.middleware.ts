import { cors } from 'hono/cors';

import { inject } from '../../../../kernel';
import { fromHonoMiddleware } from '..';
import { Middleware } from '../middleware.decorator';
import type { MiddlewareInstance, Next } from '../middleware.types';
import { CorsConfig } from './cors.config';

@Middleware
export class CorsMiddleware implements MiddlewareInstance {
  private readonly delegate: MiddlewareInstance | undefined;

  constructor(config: CorsConfig = inject(CorsConfig)) {
    if (!this.isEnabled(config)) return;

    const HonoCorsMiddleware = fromHonoMiddleware(
      cors({
        origin: config.origin,
        allowMethods: config.allowMethods,
        allowHeaders: config.allowHeaders,
        exposeHeaders: config.exposeHeaders,
        ...(config.maxAge !== undefined && { maxAge: config.maxAge }),
        credentials: config.credentials,
      }),
    );
    this.delegate = new HonoCorsMiddleware();
  }

  async use(next: Next): Promise<Response | undefined> {
    if (!this.delegate) {
      await next();
      return undefined;
    }
    return await this.delegate.use(next);
  }

  private isEnabled(config: CorsConfig): boolean {
    const { origin } = config;
    return Array.isArray(origin) ? origin.length > 0 : origin !== '';
  }
}
