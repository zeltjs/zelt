import type { FeatureRuntime } from '../../app';
import { Feature } from '../../app';
import type { HttpMetadata, HttpOptions } from './http.service';
import { HttpService } from './http.service';
import type { ControllerClass } from './http.types';
import { collectAllControllerMetadata, collectAllControllers } from './http-children.lib';
import { collectRoutes } from './routing';

export const HTTP_FEATURE_KEY = 'http' as const;

export type HttpStaticCapabilities = {
  readonly getControllers: () => readonly ControllerClass[];
  readonly getMetadata: () => HttpMetadata;
};

export type HttpCapabilities = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
};

/** @throws {ZeltDecoratorUsageError | ZeltReadyFailedError | ZeltLifecycleStateError} */
export class HttpFeature extends Feature<'http', HttpCapabilities, HttpStaticCapabilities> {
  readonly key = HTTP_FEATURE_KEY;
  private readonly controllers: readonly ControllerClass[];
  private readonly metadata: HttpMetadata;

  /** @throws {ZeltDecoratorUsageError} */
  constructor(private readonly opts: HttpOptions) {
    super();
    this.controllers = collectAllControllers(opts);
    collectRoutes(this.controllers);
    this.metadata = { controllers: collectAllControllerMetadata(opts) };
  }

  readonly staticCapabilities = (): HttpStaticCapabilities => {
    return {
      getControllers: () => this.controllers,
      getMetadata: () => this.metadata,
    };
  };

  readonly createCapabilities = async (runtime: FeatureRuntime): Promise<HttpCapabilities> => {
    const service = await runtime.get(HttpService);
    const router = await service.buildRouter(this.opts);
    return {
      fetch: async (req) => router.fetch(req),
      request: async (input, init) => {
        const req =
          typeof input === 'string' ? new Request(new URL(input, 'http://localhost'), init) : input;
        return router.fetch(req);
      },
    };
  };

  override readonly warmup = async (runtime: FeatureRuntime): Promise<void> => {
    const service = await runtime.get(HttpService);
    await service.warmupControllers(this.opts);
  };
}

export const http = (opts: HttpOptions): HttpFeature => new HttpFeature(opts);
