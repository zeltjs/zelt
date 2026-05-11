import { appendPendingRouteMetadata, type HttpMethod } from '../internal/metadata';
import { resolveMethodArgs } from '../../internal/decorator-context';

const makeDecorator =
  (method: HttpMethod) =>
  (path: string) =>
  (...args: unknown[]): void => {
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new Error(`zelt: @${method} cannot be applied to static methods`);
    }
    appendPendingRouteMetadata(pendingKey, { method, path, methodName });
  };

export const Get = makeDecorator('GET');
export const Post = makeDecorator('POST');
export const Put = makeDecorator('PUT');
export const Patch = makeDecorator('PATCH');
export const Delete = makeDecorator('DELETE');
