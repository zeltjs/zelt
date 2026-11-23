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

const hexOf = (view: ArrayBufferView): string =>
  Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

// Each value is tagged with its type, so that 1n, 1 and "1" stay apart.
const tagged = (value: unknown): unknown => {
  if (typeof value === 'object') return value === null ? ['null'] : taggedObject(value);
  if (typeof value === 'string' || typeof value === 'boolean') return [typeof value, value];
  return [typeof value, String(value)];
};

const taggedObject = (value: object): unknown => {
  if (value instanceof Date) return ['date', value.getTime()];
  if (ArrayBuffer.isView(value)) return ['bytes', hexOf(value)];
  if (Array.isArray(value)) return ['array', value.map(tagged)];
  // JSON columns may hold the same object with its keys in another order.
  return [
    'object',
    Object.keys(value)
      .sort()
      .map((key) => [key, tagged(Reflect.get(value, key))]),
  ];
};

// The one identity of column values. A row read twice holds equal values in new objects, so
// dates, bytes and JSON are compared by content.
export const valueKey = (value: unknown): string => JSON.stringify(tagged(value));
