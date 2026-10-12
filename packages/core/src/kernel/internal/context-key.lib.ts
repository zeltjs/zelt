import type { DeferredValueHandle } from '@zeltjs/unsafe-type-lib';
import { DEFERRED_VALUE_TYPE, unsafeResolveDeferredValue } from '@zeltjs/unsafe-type-lib';

import { ZeltContextNotAvailableError } from '../errors';

export class ContextKey<T> implements DeferredValueHandle<T> {
  declare [DEFERRED_VALUE_TYPE]: T;

  constructor(readonly _symbol: symbol) {}
}

export const createContextKey = <T>(name: string): ContextKey<T> => new ContextKey<T>(Symbol(name));

type ContextStore = Record<symbol, unknown>;

export type ContextMode = 'sync' | 'async';

export type ContextFrame = {
  readonly mode: ContextMode;
  readonly values: ContextStore;
  readonly storageValues: Readonly<ContextStore>;
};

export type AsyncContextCarrier = {
  get(): ContextFrame | undefined;
  run<T>(frame: ContextFrame, fn: () => T): T;
};

export type CapturedContext = {
  readonly mode: ContextMode;
  run<T>(fn: () => T): T;
};

let synchronousFrame: ContextFrame | undefined;
let asyncCarrier: AsyncContextCarrier | undefined;

export const hasAsyncContextCarrier = (): boolean => asyncCarrier !== undefined;

/** @throws {TypeError} */
export const installAsyncContextCarrier = (carrier: AsyncContextCarrier): void => {
  if (asyncCarrier !== undefined) throw new TypeError('Async context is already enabled');
  asyncCarrier = carrier;
};

export const defaultContextMode = (): ContextMode => (asyncCarrier ? 'async' : 'sync');

const currentFrame = (): ContextFrame | undefined => {
  if (synchronousFrame) return synchronousFrame;
  const frame = asyncCarrier?.get();
  return frame?.mode === 'async' ? frame : undefined;
};

const runSynchronously = <T>(frame: ContextFrame, fn: () => T): T => {
  const parent = synchronousFrame;
  synchronousFrame = frame;
  try {
    return fn();
  } finally {
    synchronousFrame = parent;
  }
};

const captureFrame = (frame: ContextFrame): CapturedContext => ({
  mode: frame.mode,
  // A sync frame also masks an enclosing ALS frame, so a portable request
  // cannot accidentally read its async caller's state after suspension.
  run: (fn) => {
    const carrier = asyncCarrier;
    const parent = carrier?.get();
    if (carrier && parent !== frame && (frame.mode === 'async' || parent?.mode === 'async')) {
      return carrier.run(frame, () => runSynchronously(frame, fn));
    }
    return runSynchronously(frame, fn);
  },
});

/** @throws {TypeError} */
const resolveContextMode = (mode: unknown, parent: ContextFrame | undefined): ContextMode => {
  const selected = mode ?? parent?.mode ?? defaultContextMode();
  if (selected === 'sync' || selected === 'async') return selected;
  throw new TypeError("Context mode must be 'sync' or 'async'");
};

const createEntryValues = (
  parent: ContextFrame | undefined,
): Pick<ContextFrame, 'values' | 'storageValues'> => ({
  values: { ...parent?.values },
  storageValues: parent?.storageValues ?? {},
});

/** @throws {TypeError} */
export const createContextScope = (
  options: { readonly mode?: ContextMode; readonly inherit?: boolean } = {},
): CapturedContext => {
  const parent = currentFrame();
  const mode = resolveContextMode(options.mode, parent);
  if (mode === 'async' && !asyncCarrier) {
    throw new TypeError(
      'Async context requires enableAsyncContext() from @zeltjs/core/async-context',
    );
  }
  return captureFrame({
    mode,
    ...createEntryValues(options.inherit === false ? undefined : parent),
  });
};

export const getStorageInternal = <T>(key: ContextKey<T>): T | undefined => {
  const value = currentFrame()?.storageValues[key._symbol];
  return value === undefined ? undefined : unsafeResolveDeferredValue(key, value);
};

export const runInStorageContext = <T, R>(key: ContextKey<T>, value: T, fn: () => R): R => {
  const parent = currentFrame();
  // Storage scopes replace their own value while sharing mutable entry state.
  // In particular, logging must not hide downstream auth or request injection.
  return captureFrame({
    mode: parent?.mode ?? defaultContextMode(),
    values: parent?.values ?? {},
    storageValues: { ...parent?.storageValues, [key._symbol]: value },
  }).run(fn);
};

export const tryCaptureContext = (): CapturedContext | undefined => {
  const frame = currentFrame();
  return frame ? captureFrame(frame) : undefined;
};

/** @throws {ZeltContextNotAvailableError} */
export const captureContext = (): CapturedContext => {
  const captured = tryCaptureContext();
  if (!captured) {
    throw new ZeltContextNotAvailableError({
      primitive: 'captureContext',
      requiredContext: 'entry',
    });
  }
  return captured;
};

/** @throws {TypeError} */
export const runInContext = <T>(fn: () => T): T => createContextScope().run(fn);

export const hasContext = (): boolean => currentFrame() !== undefined;

/** @throws {ZeltContextNotAvailableError} */
export const getInternal = <T>(key: ContextKey<T>): T | undefined => {
  const store = currentFrame()?.values;
  if (!store)
    throw new ZeltContextNotAvailableError({
      primitive: 'getInternal',
      requiredContext: 'entry',
    });
  const value = store[key._symbol];
  return value === undefined ? undefined : unsafeResolveDeferredValue(key, value);
};

/** @throws {ZeltContextNotAvailableError} */
export const setInternal = <T>(key: ContextKey<T>, value: T): void => {
  const store = currentFrame()?.values;
  if (!store)
    throw new ZeltContextNotAvailableError({
      primitive: 'setInternal',
      requiredContext: 'entry',
    });
  store[key._symbol] = value;
};
