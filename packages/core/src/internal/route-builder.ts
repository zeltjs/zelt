import type { Hono } from 'hono';

import { toErrorResponse } from '../http/error-handler';

import type { ResolverHandle } from './container';
import { runInEntryContext } from './entry-context';
import { getControllerMetadata, getRouteMetadata, type HttpMethod } from './metadata';

const stripTrailingSlash = (s: string): string =>
  s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s;

const ensureLeadingSlash = (s: string): string => (s === '' || s.startsWith('/') ? s : `/${s}`);

export const joinPath = (base: string, sub: string): string => {
  const a = stripTrailingSlash(base);
  const b = stripTrailingSlash(ensureLeadingSlash(sub));
  const joined = `${a}${b === '/' ? '' : b}`;
  return joined === '' ? '/' : joined;
};

type ControllerClass = new (...args: never[]) => object;

type Route = {
  readonly method: HttpMethod;
  readonly fullPath: string;
  readonly methodName: string | symbol;
  readonly controllerClass: ControllerClass;
};

export const collectRoutes = (controllers: readonly ControllerClass[]): readonly Route[] => {
  const routes: Route[] = [];
  for (const cls of controllers) {
    const meta = getControllerMetadata(cls);
    if (!meta) {
      throw new Error('koya: controller is missing @Controller decorator');
    }
    for (const r of getRouteMetadata(cls)) {
      routes.push({
        method: r.method,
        fullPath: joinPath(meta.basePath, r.path),
        methodName: r.methodName,
        controllerClass: cls,
      });
    }
  }
  return routes;
};

const resolveHandler = (instance: object, methodName: string | symbol): (() => unknown) => {
  // Reflect.get returns `any` for dynamic keys; pinning the local to `unknown`
  // forces narrowing before any call, keeping the handler invocation typesafe.
  const value: unknown = Reflect.get(instance, methodName);
  if (typeof value !== 'function') {
    throw new Error(
      `koya: route handler ${String(methodName)} is not a function on the controller`,
    );
  }
  return () => {
    const result: unknown = value.call(instance);
    return result;
  };
};

const parseRequestBody = async (c: Parameters<Parameters<Hono['on']>[2]>[0]): Promise<unknown> => {
  const contentType = c.req.header('content-type');
  if (contentType?.includes('application/json') !== true) return undefined;
  return c.req.json<unknown>().catch(() => undefined);
};

const registerRoute = (hono: Hono, resolver: ResolverHandle, route: Route): void => {
  const instance = resolver.get(route.controllerClass);
  const invoke = resolveHandler(instance, route.methodName);
  hono.on(route.method, route.fullPath, async (c) => {
    try {
      const body = await parseRequestBody(c);
      const pathParams: Readonly<Record<string, string>> = c.req.param();
      const result = await runInEntryContext(
        { input: { body, pathParams }, honoContext: c },
        async () => invoke(),
      );
      if (result instanceof Response) return result;
      return c.json(result);
    } catch (error) {
      return toErrorResponse(error);
    }
  });
};

export const buildRoutes = (
  hono: Hono,
  controllers: readonly ControllerClass[],
  resolver: ResolverHandle,
): void => {
  for (const route of collectRoutes(controllers)) {
    registerRoute(hono, resolver, route);
  }
};
