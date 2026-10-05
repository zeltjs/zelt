import { inject } from '../../../../kernel';
import { getHonoContext } from '../../request';
import { applyResponseHeaders } from '../../response/response-headers.feature';
import { Middleware } from '../middleware.decorator';
import type { MiddlewareInstance, Next } from '../middleware.types';
import { SecureHeadersConfig } from './secure-headers.config';

type HeaderDefinition = readonly [
  keyof Omit<SecureHeadersConfig, 'removePoweredBy'>,
  string,
  string,
];

@Middleware
export class SecureHeadersMiddleware implements MiddlewareInstance {
  private readonly poweredByHeader: readonly string[] = ['X-Powered-By'];

  private readonly noHeaders: readonly string[] = [];

  private readonly headersToSet: readonly (readonly [string, string])[];

  constructor(private readonly config: SecureHeadersConfig = inject(SecureHeadersConfig)) {
    const headerDefinitions: readonly HeaderDefinition[] = [
      ['crossOriginEmbedderPolicy', 'Cross-Origin-Embedder-Policy', 'require-corp'],
      ['crossOriginResourcePolicy', 'Cross-Origin-Resource-Policy', 'same-origin'],
      ['crossOriginOpenerPolicy', 'Cross-Origin-Opener-Policy', 'same-origin'],
      ['originAgentCluster', 'Origin-Agent-Cluster', '?1'],
      ['referrerPolicy', 'Referrer-Policy', 'no-referrer'],
      [
        'strictTransportSecurity',
        'Strict-Transport-Security',
        'max-age=15552000; includeSubDomains',
      ],
      ['xContentTypeOptions', 'X-Content-Type-Options', 'nosniff'],
      ['xDnsPrefetchControl', 'X-DNS-Prefetch-Control', 'off'],
      ['xDownloadOptions', 'X-Download-Options', 'noopen'],
      ['xFrameOptions', 'X-Frame-Options', 'SAMEORIGIN'],
      ['xPermittedCrossDomainPolicies', 'X-Permitted-Cross-Domain-Policies', 'none'],
      ['xXssProtection', 'X-XSS-Protection', '0'],
    ];
    const headers: [string, string][] = [];
    for (const [key, name, defaultValue] of headerDefinitions) {
      const value = config[key];
      if (value !== false) headers.push([name, value === true ? defaultValue : value]);
    }
    this.headersToSet = headers;
  }

  /** @throws {ZeltContextNotAvailableError | TypeError} */
  async use(next: Next, ctx = getHonoContext()): Promise<Response | undefined> {
    await next();
    applyResponseHeaders(
      ctx,
      this.headersToSet,
      this.config.removePoweredBy ? this.poweredByHeader : this.noHeaders,
    );
    return undefined;
  }
}
