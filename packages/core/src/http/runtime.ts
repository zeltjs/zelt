import type { Container } from '@needle-di/core';
import { Hono } from 'hono';

import { buildRoutes } from '../internal/route-builder';

type ControllerClass = new (...args: never[]) => object;

export type HttpRuntimeOptions = {
  readonly controllers: readonly ControllerClass[];
};

export type WorkerHandler = {
  readonly fetch: (request: Request) => Response | Promise<Response>;
};

export type HttpRuntime = {
  readonly toWorker: () => WorkerHandler;
};

export const createHttpRuntime = (
  container: Container,
  options: HttpRuntimeOptions,
): HttpRuntime => {
  // strict:false で `/echo` と `/echo/` を同一視する。joinPath が末尾スラッシュを正規化するため、
  // 利用者が `@Post('/')` と書いた場合でも `/echo/` リクエストにマッチさせる必要がある。
  const hono = new Hono({ strict: false });
  buildRoutes(hono, options.controllers, container);
  return {
    toWorker: () => ({
      fetch: (request) => hono.fetch(request),
    }),
  };
};
