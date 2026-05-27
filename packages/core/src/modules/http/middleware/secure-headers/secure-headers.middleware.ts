import type { MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { inject } from '../../../../kernel/di/inject';
import { requestContext } from '../../request/request-context';
import { Middleware } from '../middleware';
import type { MiddlewareInstance, Next } from '../types';
import { SecureHeadersConfig } from './secure-headers.config';

@Middleware
export class SecureHeadersMiddleware implements MiddlewareInstance {
  private readonly middleware: MiddlewareHandler;

  constructor(config: SecureHeadersConfig = inject(SecureHeadersConfig)) {
    this.middleware = secureHeaders({
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

  /** @throws {ZeltContextNotAvailableError} */
  async use(next: Next): Promise<Response | undefined> {
    await this.middleware(requestContext(), next);
    return undefined;
  }
}
