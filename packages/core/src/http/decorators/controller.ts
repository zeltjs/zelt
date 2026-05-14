import { injectable } from '@needle-di/core';

import { resolveClassArgs } from '../../internal/decorator-context';
import {
  resolveAuthorizedMetadata,
  resolveMethodMiddlewareMetadata,
  resolveRouteMetadata,
  resolveSkipMiddlewareMetadata,
  setControllerMetadata,
} from '../internal/metadata';
import { getCallerFile } from '../internal/source-file';

/** @throws {ZeltLifecycleStateError} */
export const Controller =
  (basePath: string) =>
  (...args: unknown[]): void => {
    const sourceFile = getCallerFile();
    const { cls, pendingKey, injectableClass } = resolveClassArgs(args);

    resolveRouteMetadata(pendingKey, cls);
    resolveMethodMiddlewareMetadata(pendingKey, cls);
    resolveSkipMiddlewareMetadata(pendingKey, cls);
    resolveAuthorizedMetadata(pendingKey, cls);

    setControllerMetadata(cls, { basePath, sourceFile });
    injectable()(injectableClass);
  };
