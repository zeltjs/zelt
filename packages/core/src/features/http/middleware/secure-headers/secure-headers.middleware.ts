import { inject } from '../../../../kernel';
import { getHonoContext } from '../../request';
import { canMutateGeneratedResponse } from '../../response/response-ownership.feature';
import { Middleware } from '../middleware.decorator';
import type { MiddlewareInstance, Next, RequestContext } from '../middleware.types';
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
    if (firstHeader) {
      this.setHeader(ctx, firstHeader[0], firstHeader[1]);
    } else if (this.config.removePoweredBy) {
      this.setHeader(ctx, 'X-Powered-By', undefined);
      return undefined;
    } else {
      return undefined;
    }

    const headers = ctx.res.headers;
    for (const [name, value] of this.headersToSet) headers.set(name, value);
    if (this.config.removePoweredBy) headers.delete('X-Powered-By');
    return undefined;
  }

  private setHeader(ctx: RequestContext, name: string, value: string | undefined): void {
    const res = ctx.res;
    // Preserve external responses and references held by user middleware.
    // Newly generated, unobserved JSON responses have writable headers.
    if (!canMutateGeneratedResponse(ctx, res)) {
      ctx.header(name, value);
      return;
    }
    if (value === undefined) res.headers.delete(name);
    else res.headers.set(name, value);
  }
}
