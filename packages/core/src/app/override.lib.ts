import type { Container } from '@needle-di/core';

import { ZeltInternalError } from '../kernel';

type AnyClass = new (...args: never[]) => unknown;

export type Override<T = unknown> = {
  readonly provide: AnyClass & (new (...args: never[]) => T);
  readonly useValue: T;
};

const containers = new WeakMap<object, Container>();

export const attachContainer = <T extends object>(app: T, container: Container): T => {
  containers.set(app, container);
  return app;
};

/** @throws {ZeltInternalError} */
export const override = (app: object, overrides: readonly Override[]): void => {
  const container = containers.get(app);
  if (!container) throw new ZeltInternalError({ reason: 'container_not_attached' });
  for (const o of overrides) {
    container.bind({ provide: o.provide, useValue: o.useValue });
  }
};
