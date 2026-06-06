import type { Container } from '@needle-di/core';
import type { FeatureRuntime } from '../../app';
import { Feature } from '../../app';
import type { HttpMetadata, HttpOptions } from './http.service';
import { HTTP_OPTIONS, HttpService } from './http.service';
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

  readonly bind = (container: Container): void => {
    container.bind({ provide: HTTP_OPTIONS, useValue: this.opts });
  };

  readonly staticCapabilities = (): HttpStaticCapabilities => {
    return {
      getControllers: () => this.controllers,
      getMetadata: () => this.metadata,
    };
  };

  readonly createCapabilities = async (runtime: FeatureRuntime): Promise<HttpCapabilities> => {
    const service = await runtime.get(HttpService);
    return {
      fetch: (req) => service.fetch(req),
      request: (input, init) => service.request(input, init),
    };
  };

  override readonly warmup = async (runtime: FeatureRuntime): Promise<void> => {
    const service = await runtime.get(HttpService);
    await service.warmupControllers();
  };
}

export const http = (opts: HttpOptions): HttpFeature => new HttpFeature(opts);
