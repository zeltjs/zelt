import { inject } from '../../../../kernel';
import { response } from '../../response';
import { Middleware } from '../middleware.decorator';
import type { MiddlewareInstance, Next } from '../middleware.types';
import { SecureHeadersConfig } from './secure-headers.config';

@Middleware
export class SecureHeadersMiddleware implements MiddlewareInstance {
  constructor(private readonly config: SecureHeadersConfig = inject(SecureHeadersConfig)) {}

  /** @throws {ZeltContextNotAvailableError} */
  async use(next: Next, res = response()): Promise<Response | undefined> {
    await next();
    this.applyHeader(
      res,
      'Cross-Origin-Embedder-Policy',
      this.config.crossOriginEmbedderPolicy,
      'require-corp',
    );
    this.applyHeader(
      res,
      'Cross-Origin-Resource-Policy',
      this.config.crossOriginResourcePolicy,
      'same-origin',
    );
    this.applyHeader(
      res,
      'Cross-Origin-Opener-Policy',
      this.config.crossOriginOpenerPolicy,
      'same-origin',
    );
    this.applyHeader(res, 'Origin-Agent-Cluster', this.config.originAgentCluster, '?1');
    this.applyHeader(res, 'Referrer-Policy', this.config.referrerPolicy, 'no-referrer');
    this.applyHeader(
      res,
      'Strict-Transport-Security',
      this.config.strictTransportSecurity,
      'max-age=15552000; includeSubDomains',
    );
    this.applyHeader(res, 'X-Content-Type-Options', this.config.xContentTypeOptions, 'nosniff');
    this.applyHeader(res, 'X-DNS-Prefetch-Control', this.config.xDnsPrefetchControl, 'off');
    this.applyHeader(res, 'X-Download-Options', this.config.xDownloadOptions, 'noopen');
    this.applyHeader(res, 'X-Frame-Options', this.config.xFrameOptions, 'SAMEORIGIN');
    this.applyHeader(
      res,
      'X-Permitted-Cross-Domain-Policies',
      this.config.xPermittedCrossDomainPolicies,
      'none',
    );
    this.applyHeader(res, 'X-XSS-Protection', this.config.xXssProtection, '0');
    if (this.config.removePoweredBy) {
      res.removeHeader('X-Powered-By');
    }
    return undefined;
  }

  private applyHeader(
    res: ReturnType<typeof response>,
    name: string,
    value: boolean | string,
    defaultValue: string,
  ): void {
    if (value === false) return;
    res.header(name, value === true ? defaultValue : value);
  }
}
