import { injectable } from '@needle-di/core';
import type { MiddlewareHandler } from 'hono';

import { requestContext } from '../request/request-context';
import type { MiddlewareClass, MiddlewareInstance, Next } from './types';

const cache = new WeakMap<MiddlewareHandler, MiddlewareClass>();

export const fromHonoMiddleware = (handler: MiddlewareHandler): MiddlewareClass => {
  const cached = cache.get(handler);
  if (cached) return cached;

  @injectable()
  class HonoMiddlewareAdapter implements MiddlewareInstance {
    /** @throws {ZeltContextNotAvailableError} */
    async use(next: Next): Promise<Response | undefined> {
      const result = await handler(requestContext(), next);
      return result instanceof Response ? result : undefined;
    }
  }

  Object.defineProperty(HonoMiddlewareAdapter, 'name', {
    value: `HonoMiddleware(${handler.name || 'anonymous'})`,
  });

  cache.set(handler, HonoMiddlewareAdapter);
  return HonoMiddlewareAdapter;
};
