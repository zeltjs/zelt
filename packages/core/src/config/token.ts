import type { ConfigClass } from './types';

type AnyConstructor = new (...args: never[]) => unknown;
type AnyConfigClass = ConfigClass<object>;
const classToToken = new WeakMap<AnyConfigClass, symbol>();

export const registerConfigToken = (cls: AnyConstructor): void => {
  classToToken.set(cls as AnyConfigClass, Symbol(cls.name));
};

export const findConfigToken = (cls: AnyConstructor): AnyConfigClass | null => {
  let current: AnyConstructor | null = cls;
  while (current && current !== Function.prototype) {
    if (classToToken.has(current as AnyConfigClass)) {
      return current as AnyConfigClass;
    }
    current = Object.getPrototypeOf(current) as AnyConstructor | null;
  }
  return null;
};

export const findRootConfigToken = (cls: AnyConstructor): AnyConfigClass | null => {
  let root: AnyConfigClass | null = null;
  let current: AnyConstructor | null = cls;
  while (current && current !== Function.prototype) {
    if (classToToken.has(current as AnyConfigClass)) {
      root = current as AnyConfigClass;
    }
    current = Object.getPrototypeOf(current) as AnyConstructor | null;
  }
  return root;
};
