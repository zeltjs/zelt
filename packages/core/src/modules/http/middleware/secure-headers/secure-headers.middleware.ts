import { secureHeaders } from 'hono/secure-headers';
import { inject } from '../../../../kernel/di';
import { Middleware } from '../middleware.decorator';
import type {
  FunctionMiddleware,
  MiddlewareInstance,
  Next,
  RequestContext,
} from '../middleware.types';
import { SecureHeadersConfig } from './secure-headers.config';

@Middleware
export class SecureHeadersMiddleware implements MiddlewareInstance {
  private readonly middleware: FunctionMiddleware;

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

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    await this.middleware(c, next);
    return undefined;
  }
}
