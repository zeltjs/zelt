import { Container, type Provider } from '@needle-di/core';

import { createHttpRuntime, type HttpRuntime, type HttpRuntimeOptions } from './http/runtime';

export type Application = {
  readonly http: (options: HttpRuntimeOptions) => HttpRuntime;
};

export type CreateAppOptions = {
  readonly providers: readonly Provider<unknown>[];
};

export const createApp = (options: CreateAppOptions): Application => {
  const container = new Container();
  for (const provider of options.providers) {
    container.bind(provider);
  }
  return {
    http: (httpOptions) => createHttpRuntime(container, httpOptions),
  };
};
