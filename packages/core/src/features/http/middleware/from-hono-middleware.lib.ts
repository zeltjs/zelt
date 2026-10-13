import { requestContext } from '../request';
import { Middleware } from './middleware.decorator';
import type {
  HonoMiddleware,
  NativeMiddlewareClass,
  NativeMiddlewareInstance,
  Next,
} from './middleware.types';

export const fromHonoMiddleware = (middleware: HonoMiddleware): NativeMiddlewareClass => {
  class HonoMiddlewareAdaptor implements NativeMiddlewareInstance {
    /** @throws {ZeltContextNotAvailableError | TypeError} */
    async use(next: Next): Promise<Response | undefined> {
      const result = await middleware(requestContext(), next);
      return result instanceof Response ? result : undefined;
    }
  }

  Middleware(HonoMiddlewareAdaptor);
  return HonoMiddlewareAdaptor;
};
