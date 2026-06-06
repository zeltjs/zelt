export const toUnknownCallable = (fn: unknown): ((...args: unknown[]) => unknown) =>
  fn as (...args: unknown[]) => unknown;
