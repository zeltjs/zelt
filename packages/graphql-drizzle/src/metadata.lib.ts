import { getMeta } from 'drizzle-metadata';
import type { Column, Table } from 'drizzle-orm';
import type { ReadResult } from './schema.types';
import { readDrizzle } from './schema-result.lib';

export type TableGraphqlMeta = { readonly name?: string; readonly hidden: boolean };

type ColumnGraphqlMeta = { readonly hidden: boolean };

// Schemas are loaded at runtime without type checking, so declared keys are validated here.
const invalid = (key: string, expected: string): ReadResult<never> => ({
  kind: 'error',
  message: `Invalid graphql-drizzle metadata: "${key}" must be ${expected}.`,
});

const readHidden = (value: unknown): ReadResult<boolean> =>
  value === undefined || typeof value === 'boolean'
    ? { kind: 'success', value: value === true }
    : invalid('graphqlHidden', 'a boolean');

const readName = (value: unknown): ReadResult<{ readonly name?: string }> => {
  if (value === undefined) return { kind: 'success', value: {} };
  return typeof value === 'string'
    ? { kind: 'success', value: { name: value } }
    : invalid('graphqlName', 'a string');
};

export const readTableGraphqlMeta = (table: Table): ReadResult<TableGraphqlMeta> => {
  const meta = readDrizzle(() => getMeta(table));
  if (meta.kind === 'error') return meta;
  const name = readName(meta.value?.graphqlName);
  if (name.kind === 'error') return name;
  const hidden = readHidden(meta.value?.graphqlHidden);
  if (hidden.kind === 'error') return hidden;
  return { kind: 'success', value: { ...name.value, hidden: hidden.value } };
};

// Generic so that Drizzle's loosely typed table columns are accepted as they are.
export const readColumnGraphqlMeta = <C extends Column>(
  column: C,
): ReadResult<ColumnGraphqlMeta> => {
  const meta = readDrizzle(() => getMeta(column));
  if (meta.kind === 'error') return meta;
  const hidden = readHidden(meta.value?.graphqlHidden);
  return hidden.kind === 'error' ? hidden : { kind: 'success', value: { hidden: hidden.value } };
};
