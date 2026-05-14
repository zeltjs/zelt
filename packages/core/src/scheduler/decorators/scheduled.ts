import { injectable } from '@needle-di/core';

import { resolveClassArgs } from '../../internal/decorator-context';
import { resolveScheduleMetadata, setScheduledMetadata } from '../internal/scheduler-metadata';

/** @throws {ZeltLifecycleStateError} */
export const Scheduled =
  () =>
  (...args: unknown[]): void => {
    const { cls, pendingKey, injectableClass } = resolveClassArgs(args);

    resolveScheduleMetadata(pendingKey, cls);
    setScheduledMetadata(cls);
    injectable()(injectableClass);
  };
