type HandleContext = {
  readonly checkLifetime: () => object;
  readonly handles: WeakMap<object, object>;
  readonly sources: WeakMap<object, object>;
};

const callableTarget = () => ((..._args: unknown[]): unknown => undefined).bind(undefined);

const unwrap = (context: HandleContext, value: unknown): unknown =>
  value !== null && (typeof value === 'object' || typeof value === 'function')
    ? (context.sources.get(value) ?? value)
    : value;

const invocationReceiver = (instance: object, method: unknown, handle: object): object =>
  typeof instance === 'function' &&
  (method === Function.prototype.call ||
    method === Function.prototype.apply ||
    method === Function.prototype.bind)
    ? handle
    : instance;

/** @throws {FeatureInjectionError | TypeError} */
const readProperty = (
  context: HandleContext,
  read: () => object,
  handle: object,
  key: string | symbol,
): unknown => {
  const instance = read();
  const value: unknown = Reflect.get(instance, key);
  if (typeof value === 'function') {
    // Bound functions must keep invoking the guarded handle after extraction.
    const receiver = invocationReceiver(instance, value, handle);
    return (...args: unknown[]): unknown => {
      read();
      return Reflect.apply(value, receiver, args);
    };
  }
  if (value === null || typeof value !== 'object') return value;
  const existing = context.handles.get(value);
  if (existing) return existing;
  const nested = createHandle(context, () => value, Array.isArray(value) ? [] : {});
  context.handles.set(value, nested);
  context.sources.set(nested, value);
  return nested;
};

/** @throws {FeatureInjectionError | TypeError} */
const propertyDescriptor = (
  context: HandleContext,
  read: () => object,
  handle: object,
  shadow: object,
  key: string | symbol,
): PropertyDescriptor | undefined => {
  const descriptor = Reflect.getOwnPropertyDescriptor(read(), key);
  if (!descriptor) return undefined;
  const configurable = Reflect.getOwnPropertyDescriptor(shadow, key)?.configurable ?? true;
  if (descriptor.writable !== undefined) {
    return { ...descriptor, configurable, value: readProperty(context, read, handle, key) };
  }
  return {
    ...descriptor,
    configurable,
    ...(descriptor.get ? { get: () => readProperty(context, read, handle, key) } : {}),
    ...(descriptor.set
      ? {
          set: (value: unknown) => {
            Reflect.set(read(), key, unwrap(context, value));
          },
        }
      : {}),
  };
};

/** @throws {FeatureInjectionError | TypeError} */
const createHandle = (context: HandleContext, source: () => object, shadow: object): object => {
  /** @throws {FeatureInjectionError | TypeError} */
  const read = (): object => {
    context.checkLifetime();
    const instance = source();
    context.handles.set(instance, handle);
    context.sources.set(handle, instance);
    return instance;
  };
  const handle: object = new Proxy(shadow, {
    apply: (_, receiver: unknown, args: unknown[]): unknown => {
      const instance = read();
      if (typeof instance !== 'function') throw new TypeError('Feature is not callable');
      return Reflect.apply(instance, receiver, args);
    },
    get: (_, key): unknown => readProperty(context, read, handle, key),
    set: (_, key, value: unknown) => {
      const instance = read();
      return Reflect.set(instance, key, unwrap(context, value), instance);
    },
    has: (_, key) => Reflect.has(read(), key),
    ownKeys: () => Reflect.ownKeys(read()),
    getPrototypeOf: () => Reflect.getPrototypeOf(read()),
    getOwnPropertyDescriptor: (_, key) => propertyDescriptor(context, read, handle, shadow, key),
  });
  return handle;
};

/**
 * Guard properties recursively while preserving aliases, cycles and method receivers.
 * Operation results retain their own resource lifetime rather than being proxied.
 * @throws {FeatureInjectionError | TypeError}
 */
export const createFeatureCapabilityHandle = (read: () => object): object =>
  createHandle(
    { checkLifetime: read, handles: new WeakMap(), sources: new WeakMap() },
    read,
    // Realization has not revealed the capability shape yet. A bound function
    // has no fixed own properties, including after compiler arrow lowering.
    callableTarget(),
  );
