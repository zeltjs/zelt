import type { Container } from '@needle-di/core';
import { InjectionToken } from '@needle-di/core';

type AnyClass = new (...args: never[]) => unknown;

const transientClasses = new WeakSet<AnyClass>();

export const registerAsTransient = (cls: AnyClass): void => {
  transientClasses.add(cls);
};

export const isTransientClass = (cls: AnyClass): boolean => transientClasses.has(cls);

type NullaryClass<T> = new () => T;

export const getTransient = <T extends object>(
  container: Container,
  cls: new (...args: never[]) => T,
): T => {
  const token = new InjectionToken<T>(Symbol());
  const factory: NullaryClass<T> = cls;
  const provider = { provide: token, useFactory: () => new factory() };
  container.bind(provider);
  const instance = container.get(token);
  container.unbind(provider);
  return instance;
};
