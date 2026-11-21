import type { Row } from './repository.types';

// Rows come from drizzle and from the generated code as plain objects; anything else is not a row.
export const toRow = (value: unknown): Row | undefined =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : undefined;

// Reads a property of a value drizzle or the schema gives without a static type.
export const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

export const rowsOf = (value: unknown): readonly Row[] =>
  Array.isArray(value)
    ? value.flatMap((item: unknown): Row[] => {
        const row = toRow(item);
        return row === undefined ? [] : [row];
      })
    : [];

export const serializeKey = (values: readonly unknown[]): string =>
  JSON.stringify(values, (_key, value: unknown) =>
    typeof value === 'bigint' ? `${value.toString()}n` : value,
  );

// Objects come from JSON and custom columns, which may hold bigint values that JSON.stringify rejects.
export const sameValue = (a: unknown, b: unknown): boolean => {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return serializeKey([a]) === serializeKey([b]);
  }
  return Object.is(a, b);
};
