export const toUnknownCallable = (fn: unknown): ((...args: unknown[]) => unknown) =>
  fn as (...args: unknown[]) => unknown;

export const unsafeGetNamespacedCallable = <TCallable extends (...args: never[]) => unknown>(
  source: object,
  namespace: PropertyKey,
  method: PropertyKey,
): TCallable | undefined => {
  const namespaceValue = Reflect.get(source, namespace);
  if (typeof namespaceValue !== 'object' || namespaceValue === null) return undefined;

  const methodValue = Reflect.get(namespaceValue, method);
  if (typeof methodValue !== 'function') return undefined;

  return methodValue as TCallable;
};
