export type StackTrace = {
  _brand: 'StackTrace';
  readonly error: Error;
  readonly callError?: Error;
};

export const captureStackTrace = (): StackTrace | undefined => {
  const error = new Error();
  if (typeof error.stack !== 'string' || error.stack.length === 0) return undefined;
  return { _brand: 'StackTrace', error };
};

export const withCallStackTrace = (
  defineTrace: StackTrace | undefined,
  callTrace: StackTrace | undefined,
): StackTrace | undefined => {
  if (!defineTrace) return undefined;
  if (!callTrace) return defineTrace;
  return { ...defineTrace, callError: callTrace.error };
};
