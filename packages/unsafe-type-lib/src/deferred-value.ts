export const DEFERRED_VALUE_TYPE: unique symbol = Symbol('zelt.deferredValueType');

export type DeferredValueHandle<T> = {
  readonly [DEFERRED_VALUE_TYPE]: T;
};

export type DeferredValueOf<THandle extends DeferredValueHandle<unknown>> =
  THandle[typeof DEFERRED_VALUE_TYPE];

export const unsafeResolveDeferredValue = <THandle extends DeferredValueHandle<unknown>>(
  handle: THandle,
  value: unknown,
): DeferredValueOf<THandle> => {
  void handle;
  return value as DeferredValueOf<THandle>;
};
