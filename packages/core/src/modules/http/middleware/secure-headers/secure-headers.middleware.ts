import { secureHeaders } from 'hono/secure-headers';

import { SecureHeadersConfig } from '../../../../built-in-service/http-security/secure-headers.config';
import { inject } from '../../../../kernel/di/inject';
import { Middleware } from '../middleware';
import type { MiddlewareInstance, Next, RequestContext } from '../types';

@Middleware
export class SecureHeadersMiddleware implements MiddlewareInstance {
  constructor(private readonly config: SecureHeadersConfig = inject(SecureHeadersConfig)) {}

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    await secureHeaders({
      crossOriginEmbedderPolicy: this.config.crossOriginEmbedderPolicy,
      crossOriginResourcePolicy: this.config.crossOriginResourcePolicy,
      crossOriginOpenerPolicy: this.config.crossOriginOpenerPolicy,
      originAgentCluster: this.config.originAgentCluster,
      referrerPolicy: this.config.referrerPolicy,
      strictTransportSecurity: this.config.strictTransportSecurity,
      xContentTypeOptions: this.config.xContentTypeOptions,
      xDnsPrefetchControl: this.config.xDnsPrefetchControl,
      xDownloadOptions: this.config.xDownloadOptions,
      xFrameOptions: this.config.xFrameOptions,
      xPermittedCrossDomainPolicies: this.config.xPermittedCrossDomainPolicies,
      xXssProtection: this.config.xXssProtection,
      removePoweredBy: this.config.removePoweredBy,
    })(c, next);
    return undefined;
  }
}
