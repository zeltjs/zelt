import { injectable } from '@needle-di/core';

import { resolveClassArgs } from '../../internal/decorator-context';
import { setScheduledMetadata, resolveScheduleMetadata } from '../internal/scheduler-metadata';

export const Scheduled =
  () =>
  (...args: unknown[]): void => {
    const { cls, pendingKey, injectableClass } = resolveClassArgs(args);

    resolveScheduleMetadata(pendingKey, cls);
    setScheduledMetadata(cls);
    injectable()(injectableClass);
  };
