import type { FeatureName, ServiceResolver } from '../../app';
import { Feature } from '../../app';
import type { HttpFetchTarget, HttpListenOptions, HttpServerHandle } from '../../built-in-service';
import { HttpListenerService } from '../../built-in-service';

export type HttpServerCapabilities = {
  readonly listen: (
    http: HttpFetchTarget,
    options?: number | HttpListenOptions,
  ) => Promise<HttpServerHandle>;
};

export class HttpServerFeature<TName extends string = 'httpServer'> extends Feature<
  TName,
  HttpServerCapabilities
> {
  static readonly defaultKey = 'httpServer';

  constructor(readonly key: TName) {
    super();
  }

  readonly featureClasses = () => [];
  readonly blueprint = () => ({});

  readonly realize = async (resolver: ServiceResolver): Promise<HttpServerCapabilities> => {
    const service = await resolver.get(HttpListenerService);
    return {
      listen: (http, options = {}) =>
        service.listen(
          http,
          typeof options === 'number' ? { port: options } : options,
          resolver.registerShutdown,
        ),
    };
  };
}

export function httpServer(): HttpServerFeature<'httpServer'>;
export function httpServer<const TName extends string>(options: {
  readonly name: TName & FeatureName<TName>;
}): HttpServerFeature<TName>;
export function httpServer(options?: { readonly name: string }): HttpServerFeature<string> {
  return new HttpServerFeature(options?.name ?? 'httpServer');
}
