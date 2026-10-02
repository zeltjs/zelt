import { inject } from '../../../../kernel';
import { getHonoContext } from '../../request';
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
  private readonly firstHeader: readonly [string, string] | undefined;

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
    const [firstHeader, ...remainingHeaders] = headers;
    this.firstHeader = firstHeader;
    this.headersToSet = remainingHeaders;
  }

  /** @throws {ZeltContextNotAvailableError} */
  async use(next: Next, ctx = getHonoContext()): Promise<Response | undefined> {
    await next();
    const firstHeader = this.firstHeader;
    // Hono's finalized header() makes immutable downstream responses writable.
    // Use it once, then update the remaining headers without copying the response.
    if (firstHeader) {
      ctx.header(firstHeader[0], firstHeader[1]);
    } else if (this.config.removePoweredBy) {
      ctx.header('X-Powered-By', undefined);
      return undefined;
    } else {
      return undefined;
    }

    const headers = ctx.res.headers;
    for (const [name, value] of this.headersToSet) headers.set(name, value);
    if (this.config.removePoweredBy) headers.delete('X-Powered-By');
    return undefined;
  }
}
