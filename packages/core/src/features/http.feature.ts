import type { HttpMetadata, HttpOptions } from '../modules/http/http.service';
import { HTTP_OPTIONS, HttpService } from '../modules/http/http.service';
import type { ControllerClass } from '../modules/http/http.types';
import type { ConfiguredFeature } from './feature.types';

export type HttpCapabilities = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
  readonly getControllers: () => readonly ControllerClass[];
  readonly getMetadata: () => HttpMetadata;
};

export const http = (opts: HttpOptions): ConfiguredFeature<'http', HttpCapabilities> => ({
  key: 'http',
  bind: (container) => {
    container.bind({ provide: HTTP_OPTIONS, useValue: opts });
  },
  createCapabilities: async (runtime) => {
    const service = await runtime.get(HttpService);
    return {
      fetch: (req) => service.fetch(req),
      request: (input, init) => service.request(input, init),
      getControllers: () => service.getControllers(),
      getMetadata: () => service.getMetadata(),
    };
  },
  warmup: async (runtime) => {
    const service = await runtime.get(HttpService);
    await service.warmupControllers();
  },
});
