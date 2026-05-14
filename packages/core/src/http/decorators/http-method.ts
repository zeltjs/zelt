import { ZeltDecoratorUsageError } from '../../errors';
import { resolveMethodArgs } from '../../internal/decorator-context';
import type { HttpMethod } from '../internal/metadata';
import { appendPendingRouteMetadata } from '../internal/metadata';

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
const makeDecorator =
  (method: HttpMethod) =>
  (path: string) =>
  (...args: unknown[]): void => {
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new ZeltDecoratorUsageError({ decoratorName: method, reason: 'static_method' });
    }
    appendPendingRouteMetadata(pendingKey, { method, path, methodName });
  };

export const Get = makeDecorator('GET');
export const Post = makeDecorator('POST');
export const Put = makeDecorator('PUT');
export const Patch = makeDecorator('PATCH');
export const Delete = makeDecorator('DELETE');
