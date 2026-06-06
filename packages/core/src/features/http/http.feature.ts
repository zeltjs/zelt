import type { ConfiguredFeature } from '../feature.types';
import type { HttpMetadata, HttpOptions } from './http.service';
import { HTTP_OPTIONS, HttpService } from './http.service';
import type { ControllerClass } from './http.types';
import { collectAllControllerMetadata, collectAllControllers } from './http-children.lib';

export const HTTP_FEATURE_KEY = 'http' as const;

export type HttpStaticCapabilities = {
  readonly getControllers: () => readonly ControllerClass[];
  readonly getMetadata: () => HttpMetadata;
};

export type HttpCapabilities = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
};

/** @throws {ZeltReadyFailedError | ZeltLifecycleStateError} */
export const http = (
  opts: HttpOptions,
): ConfiguredFeature<'http', HttpCapabilities, HttpStaticCapabilities> => ({
  key: HTTP_FEATURE_KEY,
  bind: (container) => {
    container.bind({ provide: HTTP_OPTIONS, useValue: opts });
  },
  staticCapabilities: () => ({
    getControllers: () => collectAllControllers(opts),
    getMetadata: () => ({ controllers: collectAllControllerMetadata(opts) }),
  }),
  createCapabilities: async (runtime) => {
    const service = await runtime.get(HttpService);
    return {
      fetch: (req) => service.fetch(req),
      request: (input, init) => service.request(input, init),
    };
  },
  warmup: async (runtime) => {
    const service = await runtime.get(HttpService);
    await service.warmupControllers();
  },
});
