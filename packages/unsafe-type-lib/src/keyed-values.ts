type KeyedItem = {
  readonly key: PropertyKey;
};

export type KeyedMethodValue<TItem, TMethod extends PropertyKey> = TMethod extends keyof TItem
  ? TItem[TMethod] extends (...args: readonly never[]) => infer TValue
    ? Awaited<TValue>
    : never
  : never;

export type ObjectFromKeyedValues<
  TItems extends readonly KeyedItem[],
  TMethod extends PropertyKey,
> = {
  readonly [TItem in TItems[number] as TItem['key']]: KeyedMethodValue<TItem, TMethod>;
};

export type MapFromKeyedValues<
  TItems extends readonly KeyedItem[],
  TMethod extends PropertyKey,
> = ReadonlyMap<TItems[number], KeyedMethodValue<TItems[number], TMethod>>;

export type KeyedValues<TItems extends readonly KeyedItem[], TMethod extends PropertyKey> = {
  readonly object: ObjectFromKeyedValues<TItems, TMethod>;
  readonly map: MapFromKeyedValues<TItems, TMethod>;
};

export type KeyedValueEntry<TItem extends KeyedItem, TMethod extends PropertyKey> = {
  readonly key: TItem['key'];
  readonly item: TItem;
  readonly value: KeyedMethodValue<TItem, TMethod>;
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

export const unsafeKeyedValues = async <
  TContext,
  const TMethod extends PropertyKey,
  const TItems extends readonly (KeyedItem & {
    readonly [TKey in TMethod]: (context: TContext) => object | Promise<object>;
  })[],
>(
  items: TItems,
  method: TMethod,
  context: TContext,
): Promise<KeyedValues<TItems, TMethod>> => {
  const object: Record<PropertyKey, object> = {};
  const map = new Map<KeyedItem, object>();

  for (const item of items) {
    const value = await item[method](context);
    object[item.key] = value;
    map.set(item, value);
  }

  return {
    object: object as ObjectFromKeyedValues<TItems, TMethod>,
    map: map as unknown as MapFromKeyedValues<TItems, TMethod>,
  };
};

export const unsafeGetKeyedValueEntriesForClass = <
  const TMethod extends PropertyKey,
  const TItems extends readonly KeyedItem[],
  const TClass extends abstract new (
    ...args: never[]
  ) => TItems[number],
>(
  items: TItems,
  values: MapFromKeyedValues<TItems, TMethod>,
  itemClass: TClass,
): readonly KeyedValueEntry<InstanceType<TClass>, TMethod>[] => {
  const entries: KeyedValueEntry<InstanceType<TClass>, TMethod>[] = [];

  for (const item of items) {
    if (!(item instanceof itemClass)) continue;
    entries.push({
      key: item.key,
      item: item as InstanceType<TClass>,
      value: values.get(item) as KeyedMethodValue<InstanceType<TClass>, TMethod>,
    });
  }

  return entries;
};
