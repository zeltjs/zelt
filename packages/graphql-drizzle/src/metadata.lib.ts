import type { Column, ColumnBuilderBase } from 'drizzle-orm';
import { is, Table } from 'drizzle-orm';
import type { ReadResult } from './schema.types';

export type TableGraphqlMeta = {
  readonly name?: string;
  hidden?: true;
};

export type ColumnGraphqlMeta = {
  hidden?: true;
};

const metadataKey = Symbol.for('@zeltjs/graphql-drizzle/meta');

// Drizzle shares this config object between a builder and its built column.
const metadataTarget = (target: object): ReadResult<object> => {
  if (is(target, Table)) return { kind: 'success', value: target };
  const config: unknown = Reflect.get(target, 'config');
  return typeof config === 'object' && config !== null
    ? { kind: 'success', value: config }
    : { kind: 'error', message: 'gqlMeta expects a Drizzle table, column, or column builder.' };
};

/** @throws {Error} Invalid targets violate the typed gqlMeta contract. */
export function gqlMeta<T extends Table>(target: T, meta: TableGraphqlMeta): T;
/** @throws {Error} Invalid targets violate the typed gqlMeta contract. */
export function gqlMeta<T extends ColumnBuilderBase | Column>(
  target: T,
  meta: ColumnGraphqlMeta,
): T;
/** @throws {Error} Invalid targets violate the typed gqlMeta contract. */
export function gqlMeta(
  target: Table | ColumnBuilderBase | Column,
  meta: TableGraphqlMeta,
): object {
  const container = metadataTarget(target);
  if (container.kind === 'error') throw new Error(container.message);
  Object.defineProperty(container.value, metadataKey, {
    value: Object.freeze({ ...meta }),
    configurable: true,
  });
  return target;
}

export const readGraphqlMeta = (target: Table | Column): ReadResult<TableGraphqlMeta> => {
  const container = metadataTarget(target);
  if (container.kind === 'error') return container;
  const meta: unknown = Reflect.get(container.value, metadataKey);
  if (meta === undefined) return { kind: 'success', value: {} };
  if (typeof meta !== 'object' || meta === null) {
    return { kind: 'error', message: 'Invalid graphql-drizzle metadata.' };
  }
  const name: unknown = Reflect.get(meta, 'name');
  const hidden: unknown = Reflect.get(meta, 'hidden');
  return {
    kind: 'success',
    value: {
      ...(typeof name === 'string' ? { name } : {}),
      ...(hidden === true ? { hidden: true } : {}),
    },
  };
};
