import { injectable } from '@needle-di/core';

import { setScheduledMetadata } from '../internal/scheduler-metadata';

type AnyClass = new (...args: never[]) => object;

export const Scheduled =
  () =>
  <T extends AnyClass>(target: T): T => {
    setScheduledMetadata(target);
    const wrapped: T | void = injectable<T>()(target);
    return wrapped ?? target;
  };
