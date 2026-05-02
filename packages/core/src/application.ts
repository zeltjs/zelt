import { Container, type Provider } from '@needle-di/core';

import type { HttpRuntime, HttpRuntimeOptions } from './http/runtime';

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
  // Task 10 で http() を `createHttpRuntime(container, httpOptions)` に差し替える。
  // 現状は public 型 (Application.http) の shape だけ確定させる。
  return {
    http: () => {
      throw new Error('koya: http() implementation deferred to Task 10');
    },
  };
};
