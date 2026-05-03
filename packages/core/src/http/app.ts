import { Hono } from 'hono';

import { createContainer } from '../internal/container';
import { buildRoutes } from '../internal/route-builder';

type ControllerClass = new (...args: never[]) => object;

export type CreateHttpAppOptions = {
  readonly controllers: readonly ControllerClass[];
};

export type WorkerHandler = {
  readonly fetch: (request: Request) => Response | Promise<Response>;
};

export type HttpApp = {
  readonly toWorker: () => WorkerHandler;
};

export const createHttpApp = (options: CreateHttpAppOptions): HttpApp => {
  const resolver = createContainer();
  // strict:false で `/echo` と `/echo/` を同一視する。joinPath が末尾スラッシュを正規化するため、
  // 利用者が `@Post('/')` と書いた場合でも `/echo/` リクエストにマッチさせる必要がある。
  const hono = new Hono({ strict: false });
  buildRoutes(hono, options.controllers, resolver);
  return {
    toWorker: () => ({
      fetch: (request) => hono.fetch(request),
    }),
  };
};
