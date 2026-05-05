import {
  appendMethodMiddlewareMetadata,
  setControllerMiddlewareMetadata,
} from '../internal/metadata';
import type { MiddlewareInput } from '../middleware/types';

export const UseMiddleware =
  (...middlewares: MiddlewareInput[]) =>
  (target: object, propertyKey?: string | symbol): void => {
    if (propertyKey === undefined) {
      setControllerMiddlewareMetadata(target, middlewares);
    } else {
      if (typeof target === 'function') {
        throw new Error('zelt: @UseMiddleware cannot be applied to static methods');
      }
      appendMethodMiddlewareMetadata(target.constructor, propertyKey, middlewares);
    }
  };
