import type { Container } from '@needle-di/core';

type AnyClass = new (...args: never[]) => unknown;

export type Override<T = unknown> = {
  readonly provide: AnyClass & (new (...args: never[]) => T);
  readonly useValue: T;
};

const CONTAINER_SYMBOL: unique symbol = Symbol('zelt:container');

type AppWithContainer = {
  readonly [CONTAINER_SYMBOL]: Container;
};

export const attachContainer = <T extends object>(
  app: T,
  container: Container,
): T & AppWithContainer => Object.assign(app, { [CONTAINER_SYMBOL]: container });

export const override = (app: object, overrides: readonly Override[]): void => {
  const container = (app as AppWithContainer)[CONTAINER_SYMBOL];
  for (const o of overrides) {
    container.bind({ provide: o.provide, useValue: o.useValue });
  }
};
