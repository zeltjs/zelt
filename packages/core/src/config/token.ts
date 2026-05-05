type AnyConstructor = new (...args: never[]) => unknown;

export const findConfigToken = (cls: AnyConstructor): AnyConstructor | null => {
  let current: AnyConstructor | null = cls;
  while (current && current !== Function.prototype) {
    if ('Token' in current) {
      return (current as { Token: AnyConstructor }).Token;
    }
    current = Object.getPrototypeOf(current) as AnyConstructor | null;
  }
  return null;
};
