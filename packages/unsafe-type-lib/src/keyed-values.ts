type KeyedItem = {
  readonly key: PropertyKey;
};

type KeyedMethodValue<TItem, TMethod extends PropertyKey> = TMethod extends keyof TItem
  ? TItem[TMethod] extends (context: never) => infer TValue
    ? Awaited<TValue>
    : never
  : never;

export type ObjectFromKeyedValues<
  TItems extends readonly KeyedItem[],
  TMethod extends PropertyKey,
> = {
  readonly [TItem in TItems[number] as TItem['key']]: KeyedMethodValue<TItem, TMethod>;
};

type IsEmptyObject<T> = keyof T extends never ? true : false;

export type ObjectFromNonEmptyKeyedValues<
  TItems extends readonly KeyedItem[],
  TMethod extends PropertyKey,
> = {
  readonly [TItem in TItems[number] as IsEmptyObject<KeyedMethodValue<TItem, TMethod>> extends true
    ? never
    : TItem['key']]: KeyedMethodValue<TItem, TMethod>;
};

const isEmptyObject = (value: object): boolean => Object.keys(value).length === 0;

export const unsafeObjectFromKeyedValuesSync = <
  const TMethod extends PropertyKey,
  const TItems extends readonly (KeyedItem & {
    readonly [TKey in TMethod]: () => object;
  })[],
>(
  items: TItems,
  method: TMethod,
): ObjectFromKeyedValues<TItems, TMethod> => {
  const result: Record<PropertyKey, object> = {};

  for (const item of items) {
    result[item.key] = item[method]();
  }

  return result as ObjectFromKeyedValues<TItems, TMethod>;
};

export const unsafeObjectFromNonEmptyKeyedValuesSync = <
  const TMethod extends PropertyKey,
  const TItems extends readonly (KeyedItem & {
    readonly [TKey in TMethod]: () => object;
  })[],
>(
  items: TItems,
  method: TMethod,
): ObjectFromNonEmptyKeyedValues<TItems, TMethod> => {
  const result: Record<PropertyKey, object> = {};

  for (const item of items) {
    const value = item[method]();
    if (!isEmptyObject(value)) {
      result[item.key] = value;
    }
  }

  return result as ObjectFromNonEmptyKeyedValues<TItems, TMethod>;
};

export const unsafeObjectFromKeyedValues = async <
  TContext,
  const TMethod extends PropertyKey,
  const TItems extends readonly (KeyedItem & {
    readonly [TKey in TMethod]: (context: TContext) => object | Promise<object>;
  })[],
>(
  items: TItems,
  method: TMethod,
  context: TContext,
): Promise<ObjectFromKeyedValues<TItems, TMethod>> => {
  const result: Record<PropertyKey, object> = {};

  for (const item of items) {
    result[item.key] = await item[method](context);
  }

  return result as ObjectFromKeyedValues<TItems, TMethod>;
};
