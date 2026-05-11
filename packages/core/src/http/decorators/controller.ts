import { injectable } from '@needle-di/core';

import { resolveClassArgs } from '../../internal/decorator-context';
import {
  setControllerMetadata,
  resolveRouteMetadata,
  resolveMethodMiddlewareMetadata,
  resolveSkipMiddlewareMetadata,
  resolveAuthorizedMetadata,
} from '../internal/metadata';

export const Controller =
  (basePath: string) =>
  (...args: unknown[]): void => {
    const { cls, pendingKey, injectableClass } = resolveClassArgs(args);

    resolveRouteMetadata(pendingKey, cls);
    resolveMethodMiddlewareMetadata(pendingKey, cls);
    resolveSkipMiddlewareMetadata(pendingKey, cls);
    resolveAuthorizedMetadata(pendingKey, cls);

    setControllerMetadata(cls, { basePath });
    injectable()(injectableClass);
  };
