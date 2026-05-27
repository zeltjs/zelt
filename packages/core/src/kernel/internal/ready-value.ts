import { ZeltLifecycleStateError } from '../errors';

declare const READY_VALUE_BRAND: unique symbol;

export type ReadyValue<T> = Readonly<T> & { [READY_VALUE_BRAND]: true };

type ReadyValueState = 'pending' | 'ready' | 'disposed';

const states = new WeakMap<object, ReadyValueState>();

class ReadyValueBase {}

const protoProxy = new Proxy(Object.getPrototypeOf(new ReadyValueBase()) as object, {
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
  set(_, prop) {
    throw new ZeltLifecycleStateError({
      operation: `set '${String(prop)}'`,
      currentState: 'ready',
    });
  },
});

export function createReadyValue<T extends object>(): ReadyValue<T> {
  const obj: object = new ReadyValueBase();
  Object.setPrototypeOf(obj, protoProxy);
  states.set(obj, 'pending');
  return obj as never;
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
  const valueRecord = value as never as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    Object.defineProperty(readyValue, key, {
      value: valueRecord[key],
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
