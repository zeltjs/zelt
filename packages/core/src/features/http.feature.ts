import type { HttpCapabilities } from '../modules/http/http.module';
import type { HttpOptions } from '../modules/http/http.service';
import { HTTP_OPTIONS, HttpService } from '../modules/http/http.service';
import type { ConfiguredFeature } from './feature.types';

export type { HttpCapabilities };

export const http = (opts: HttpOptions): ConfiguredFeature<'http', HttpCapabilities> => ({
  key: 'http',
  bind: (container) => {
    container.bind({ provide: HTTP_OPTIONS, useValue: opts });
  },
  resolve: (container) => {
    const service = container.get(HttpService);
    return {
      fetch: (req) => service.fetch(req),
      request: (input, init) => service.request(input, init),
      getControllers: () => service.getControllers(),
      getMetadata: () => service.getMetadata(),
    };
  },
});
