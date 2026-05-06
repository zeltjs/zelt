import { Hono } from 'hono';

import { createContainer } from '../internal/container';
import { buildRoutes } from '../internal/route-builder';
import type {
  ErrorHandlerClass,
  ErrorHandlerInstance,
  MiddlewareInput,
  RequestContext,
} from '../middleware/types';
import { createSchedulerRunner, type SchedulerRunner } from '../scheduler/runner';

import { handleError } from './error-handler';

type ControllerClass = new (...args: never[]) => object;
type SchedulerClass = new (...args: never[]) => object;
type Resolver = { get: <T extends object>(cls: new (...args: never[]) => T) => T };

export type CreateHttpAppOptions = {
  readonly controllers: readonly ControllerClass[];
  readonly schedulers?: readonly SchedulerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly errorHandlers?: readonly ErrorHandlerClass[];
  readonly configs?: readonly (new (...args: never[]) => unknown)[];
};

export type HttpApp = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
  readonly startScheduler: () => void;
  readonly stopScheduler: () => Promise<void>;
};

const createErrorHandler =
  (errorHandlers: readonly ErrorHandlerInstance[]) =>
  async (err: Error, c: RequestContext): Promise<Response> => {
    for (const handler of errorHandlers) {
      const result = await handler.onError(err, c);
      if (result) return result;
    }
    return handleError(err);
  };

const resolveErrorHandler = (cls: ErrorHandlerClass, resolver: Resolver): ErrorHandlerInstance => {
  const instance: ErrorHandlerInstance = resolver.get(cls);
  return instance;
};

const resolveErrorHandlers = (
  classes: readonly ErrorHandlerClass[],
  resolver: Resolver,
): ErrorHandlerInstance[] => classes.map((cls) => resolveErrorHandler(cls, resolver));

export const createHttpApp = (options: CreateHttpAppOptions): HttpApp => {
  const resolver = createContainer({ configs: options.configs });
  // strict:false で `/echo` と `/echo/` を同一視する。joinPath が末尾スラッシュを正規化するため、
  // 利用者が `@Post('/')` と書いた場合でも `/echo/` リクエストにマッチさせる必要がある。
  const hono = new Hono({ strict: false });

  const errorHandlers = resolveErrorHandlers(options.errorHandlers ?? [], resolver);
  hono.onError(createErrorHandler(errorHandlers));

  buildRoutes(hono, options.controllers, resolver, options.middlewares ?? []);

  let schedulerRunner: SchedulerRunner | undefined;
  if (options.schedulers && options.schedulers.length > 0) {
    schedulerRunner = createSchedulerRunner(options.schedulers, resolver);
  }

  const fetch = (req: Request): Promise<Response> => Promise.resolve(hono.fetch(req));
  const request = (input: string | Request, init?: RequestInit): Promise<Response> => {
    // path 文字列の場合は localhost ベースで Request を組み立てる。テスト用 ergonomic API なので
    // host/scheme は意味を持たない (hono `app.request` と同じ慣例)。
    const req =
      typeof input === 'string' ? new Request(new URL(input, 'http://localhost'), init) : input;
    return fetch(req);
  };

  const startScheduler = (): void => {
    schedulerRunner?.start();
  };

  const stopScheduler = async (): Promise<void> => {
    await schedulerRunner?.stop();
  };

  return { fetch, request, startScheduler, stopScheduler };
};
