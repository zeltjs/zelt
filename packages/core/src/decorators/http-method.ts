import { appendRouteMetadata, type HttpMethod } from '../internal/metadata';

// legacy method decorator: instance method なら target は prototype (object)、static なら target は class (function).
// typeof target === 'function' で static を識別して throw する。
const makeDecorator =
  (method: HttpMethod) =>
  (path: string): MethodDecorator =>
  (target, propertyKey): void => {
    if (typeof target === 'function') {
      throw new Error(`zelt: @${method} cannot be applied to static methods`);
    }
    appendRouteMetadata(target.constructor, { method, path, methodName: propertyKey });
  };

export const Get = makeDecorator('GET');
export const Post = makeDecorator('POST');
export const Put = makeDecorator('PUT');
export const Patch = makeDecorator('PATCH');
export const Delete = makeDecorator('DELETE');
