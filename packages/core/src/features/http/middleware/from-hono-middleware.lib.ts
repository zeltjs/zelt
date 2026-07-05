import { requestContext } from '../request';
import { Middleware } from './middleware.decorator';
import type { HonoMiddleware, MiddlewareClass, MiddlewareInstance, Next } from './middleware.types';

export const fromHonoMiddleware = (middleware: HonoMiddleware): MiddlewareClass => {
  class HonoMiddlewareAdaptor implements MiddlewareInstance {
    /** @throws {ZeltContextNotAvailableError} */
    async use(next: Next): Promise<Response | undefined> {
      const result = await middleware(requestContext(), next);
      return result instanceof Response ? result : undefined;
    }
  }

  Middleware(HonoMiddlewareAdaptor);
  return HonoMiddlewareAdaptor;
};
