import type { Container } from '@needle-di/core';

export type HttpRuntimeOptions = {
  readonly controllers: readonly unknown[];
};

export type WorkerHandler = {
  readonly fetch: (request: Request) => Response | Promise<Response>;
};

export type HttpRuntime = {
  readonly toWorker: () => WorkerHandler;
};

// Task 10 で Hono をベースにした実装に差し替える。
// Task 8 では createApp が型として依存できる shape のみ確定する。
export const createHttpRuntime = (
  _container: Container,
  _options: HttpRuntimeOptions,
): HttpRuntime => ({
  toWorker: () => ({
    fetch: () => {
      throw new Error('koya: createHttpRuntime implementation deferred to Task 10');
    },
  }),
});
