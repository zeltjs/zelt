import type { DeferredValueHandle, DeferredValueOf } from '@zeltjs/unsafe-type-lib';
import { DEFERRED_VALUE_TYPE, unsafeResolveDeferredValue } from '@zeltjs/unsafe-type-lib';

import { ZeltLifecycleStateError } from '../errors';

declare const READY_VALUE_BRAND: unique symbol;

type ReadyValueShape<T extends object> = Readonly<T> & { [READY_VALUE_BRAND]: true };

export type ReadyValue<T extends object> = DeferredValueOf<ReadyValueBase<T>>;

type ReadyValueState = 'pending' | 'ready' | 'disposed';

const states = new WeakMap<object, ReadyValueState>();

class ReadyValueBase<T extends object> implements DeferredValueHandle<ReadyValueShape<T>> {
  declare [DEFERRED_VALUE_TYPE]: ReadyValueShape<T>;
  declare [READY_VALUE_BRAND]: true;
}

const protoProxy = new Proxy(ReadyValueBase.prototype, {
  get(target, prop, receiver: object): unknown {
    if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);

    const state = states.get(receiver);
    if (state === 'pending') {
      throw new ZeltLifecycleStateError({
        operation: `access '${String(prop)}'`,
        currentState: 'pending',
      });
    }
    if (state === 'disposed') {
      throw new ZeltLifecycleStateError({
        operation: `access '${String(prop)}'`,
        currentState: 'disposed',
      });
    }
    throw new ZeltLifecycleStateError({
      operation: `access unknown property '${String(prop)}'`,
      currentState: 'ready',
    });
  },
  set(_, prop, __, receiver: object) {
    const state = states.get(receiver);
    throw new ZeltLifecycleStateError({
      operation: `set '${String(prop)}'`,
      currentState: state === 'pending' || state === 'disposed' ? state : 'ready',
    });
  },
});

export function createReadyValue<T extends object>(): ReadyValue<T> {
  const obj = new ReadyValueBase<T>();
  Object.setPrototypeOf(obj, protoProxy);
  states.set(obj, 'pending');
  return unsafeResolveDeferredValue(obj, obj);
}

/** @throws {ZeltLifecycleStateError} */
export function sealReadyValue<T extends object>(readyValue: ReadyValue<T>, value: T): void {
  const state = states.get(readyValue);
  if (state !== 'pending') {
    throw new ZeltLifecycleStateError({
      operation: 'seal ReadyValue',
      currentState: state ?? 'disposed',
    });
  }
  for (const [key, propertyValue] of Object.entries(value)) {
    Object.defineProperty(readyValue, key, {
      value: propertyValue,
      writable: false,
      enumerable: true,
      configurable: true,
    });
  }
  states.set(readyValue, 'ready');
}

/** @throws {ZeltLifecycleStateError} */
export const disposeReadyValue = <T extends object>(readyValue: ReadyValue<T>): void => {
  const state = states.get(readyValue);
  if (state === 'disposed') return;

  for (const key of Object.keys(readyValue)) {
    const capturedKey = key;
    Object.defineProperty(readyValue, key, {
      get() {
        throw new ZeltLifecycleStateError({
          operation: `access '${capturedKey}'`,
          currentState: 'disposed',
        });
      },
      enumerable: true,
      configurable: true,
    });
  }
  states.set(readyValue, 'disposed');
};
