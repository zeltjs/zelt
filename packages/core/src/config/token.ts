import type { ConfigClass } from './types';

type AnyConstructor = new (...args: never[]) => unknown;
type AnyConfigClass = ConfigClass<object>;

export const findConfigToken = (cls: AnyConstructor): AnyConfigClass | null => {
  let current: AnyConstructor | null = cls;
  while (current && current !== Function.prototype) {
    if ('Token' in current) {
      return (current as { Token: AnyConfigClass }).Token;
    }
    current = Object.getPrototypeOf(current) as AnyConstructor | null;
  }
  return null;
};
