import type { RegisteredRuntimeShutdown, RuntimeShutdownCallback } from './feature.types';

export type RuntimeShutdownData = {
  readonly before: Set<RegisteredRuntimeShutdown>;
  readonly after: Set<RegisteredRuntimeShutdown>;
  promise: Promise<void> | undefined;
};

export const createRuntimeShutdownData = (): RuntimeShutdownData => ({
  before: new Set(),
  after: new Set(),
  promise: undefined,
});

/** @throws {AggregateError} */
export const runShutdownCallbacks = async (
  callbacks: ReadonlySet<RegisteredRuntimeShutdown>,
): Promise<void> => {
  const results = await Promise.allSettled([...callbacks].map((callback) => callback()));
  const errors: unknown[] = [];
  for (const result of results) {
    if (result.status === 'rejected') errors.push(result.reason);
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'One or more runtime shutdown callbacks failed');
  }
};

export const registerShutdownCallback = (
  callbacks: Set<RegisteredRuntimeShutdown>,
  callback: RuntimeShutdownCallback,
): RegisteredRuntimeShutdown => {
  const registered = async (): Promise<void> => {
    if (!callbacks.delete(registered)) return;
    await callback();
  };
  callbacks.add(registered);
  return registered;
};
