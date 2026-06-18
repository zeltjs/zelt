export class CaptureStackError extends Error {
  override readonly name = 'CaptureStackError';
  constructor() {
    super('Capture stack trace');
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type StackTrace = {
  _brand: 'StackTrace';
  readonly error: CaptureStackError;
  readonly callError?: CaptureStackError;
};

export const captureStackTrace = (): StackTrace | undefined => {
  const error = new CaptureStackError();
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
