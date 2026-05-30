import type { Module } from '../module.types';
import type { HttpMetadata, HttpOptions } from './http.service';
import { HTTP_OPTIONS, HttpService } from './http.service';
import type { ControllerClass } from './http.types';

export type HttpCapabilities = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
  readonly getControllers: () => readonly ControllerClass[];
  readonly getMetadata: () => HttpMetadata;
};

export type HttpModule = typeof HttpModule;
export const HttpModule: Module<'http', HttpOptions, HttpCapabilities> = {
  key: 'http',
  bind: (container, config) => {
    container.bind({ provide: HTTP_OPTIONS, useValue: config });
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
};
