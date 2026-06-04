export const isClassConstructor = <T extends object = object>(
  value: unknown,
): value is new (
  ...args: never[]
) => T => {
  if (typeof value !== 'function') return false;

  try {
    Reflect.construct(Object, [], value);
    return true;
  } catch {
    return false;
  }
};
