import { injectable } from '@needle-di/core';

import { resolveClassArgs } from '../internal/decorator-context';
import {
  setControllerMetadata,
  resolveRouteMetadata,
  resolveMethodMiddlewareMetadata,
  resolveSkipMiddlewareMetadata,
  resolveAuthorizedMetadata,
} from '../internal/metadata';

export const Controller =
  (basePath: string) =>
  (...args: unknown[]): unknown => {
    const { cls, pendingKey } = resolveClassArgs(args);

    resolveRouteMetadata(pendingKey, cls);
    resolveMethodMiddlewareMetadata(pendingKey, cls);
    resolveSkipMiddlewareMetadata(pendingKey, cls);
    resolveAuthorizedMetadata(pendingKey, cls);

    setControllerMetadata(cls, { basePath });
    injectable()(cls as new (...args: never[]) => object);
    return cls;
  };
