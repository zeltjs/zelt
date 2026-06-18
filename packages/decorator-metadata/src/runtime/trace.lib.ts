export type StackTrace = {
  _brand: 'StackTrace';
  readonly error: Error;
  readonly callError?: Error;
};

export const captureStackTrace = (): StackTrace | undefined => {
  if (Object.getOwnPropertyDescriptor(Error.prototype, 'stack') !== undefined) return undefined;
  return { _brand: 'StackTrace', error: new Error() };
};

export const withCallStackTrace = (
  defineTrace: StackTrace | undefined,
  callTrace: StackTrace | undefined,
): StackTrace | undefined => {
  if (!defineTrace) return undefined;
  if (!callTrace) return defineTrace;
  return { ...defineTrace, callError: callTrace.error };
};
