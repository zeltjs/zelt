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
