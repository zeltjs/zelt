import { secureHeaders } from 'hono/secure-headers';

import { SecureHeadersConfig } from '../../../../built-in-service/http-security/secure-headers.config';
import { inject } from '../../../../kernel/di/inject';
import { Middleware } from '../middleware';
import type { FunctionMiddleware, MiddlewareInstance, Next, RequestContext } from '../types';

@Middleware
export class SecureHeadersMiddleware implements MiddlewareInstance {
  private readonly honoMiddleware: FunctionMiddleware;

  constructor(config: SecureHeadersConfig = inject(SecureHeadersConfig)) {
    this.honoMiddleware = secureHeaders({
      crossOriginEmbedderPolicy: config.crossOriginEmbedderPolicy,
      crossOriginResourcePolicy: config.crossOriginResourcePolicy,
      crossOriginOpenerPolicy: config.crossOriginOpenerPolicy,
      originAgentCluster: config.originAgentCluster,
      referrerPolicy: config.referrerPolicy,
      strictTransportSecurity: config.strictTransportSecurity,
      xContentTypeOptions: config.xContentTypeOptions,
      xDnsPrefetchControl: config.xDnsPrefetchControl,
      xDownloadOptions: config.xDownloadOptions,
      xFrameOptions: config.xFrameOptions,
      xPermittedCrossDomainPolicies: config.xPermittedCrossDomainPolicies,
      xXssProtection: config.xXssProtection,
      removePoweredBy: config.removePoweredBy,
    });
  }

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    await this.honoMiddleware(c, next);
    return undefined;
  }
}
