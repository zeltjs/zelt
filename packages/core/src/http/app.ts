import { Hono } from 'hono';

import { createContainer } from '../internal/container';
import { buildRoutes } from '../internal/route-builder';
import type { MiddlewareInput } from '../middleware/types';

import { handleError } from './error-handler';

type ControllerClass = new (...args: never[]) => object;

export type CreateHttpAppOptions = {
  readonly controllers: readonly ControllerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly configs?: readonly (new (...args: never[]) => unknown)[];
};

export type HttpApp = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
};

export const createHttpApp = (options: CreateHttpAppOptions): HttpApp => {
  const resolver = createContainer({ configs: options.configs });
  // strict:false で `/echo` と `/echo/` を同一視する。joinPath が末尾スラッシュを正規化するため、
  // 利用者が `@Post('/')` と書いた場合でも `/echo/` リクエストにマッチさせる必要がある。
  const hono = new Hono({ strict: false });

  hono.onError((err) => handleError(err));

  buildRoutes(hono, options.controllers, resolver, options.middlewares ?? []);

  const fetch = (req: Request): Promise<Response> => Promise.resolve(hono.fetch(req));
  const request = (input: string | Request, init?: RequestInit): Promise<Response> => {
    // path 文字列の場合は localhost ベースで Request を組み立てる。テスト用 ergonomic API なので
    // host/scheme は意味を持たない (hono `app.request` と同じ慣例)。
    const req =
      typeof input === 'string' ? new Request(new URL(input, 'http://localhost'), init) : input;
    return fetch(req);
  };

  return { fetch, request };
};
