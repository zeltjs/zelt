import { injectable } from '@needle-di/core';

import { resolveClassArgs } from '../internal/decorator-context';
import { setScheduledMetadata, resolveScheduleMetadata } from '../internal/scheduler-metadata';

export const Scheduled =
  () =>
  (...args: unknown[]): unknown => {
    const { cls, pendingKey } = resolveClassArgs(args);

    resolveScheduleMetadata(pendingKey, cls);
    setScheduledMetadata(cls);
    injectable()(cls as new (...args: never[]) => object);
    return cls;
  };
