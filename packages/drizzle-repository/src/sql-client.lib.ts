import type { SQL, Table } from 'drizzle-orm';
import { and, Column, eq, getTableColumns, is } from 'drizzle-orm';

import type { Row } from './repository.types';
import { fieldOf } from './row.lib';

// drizzle's builders are typed per dialect and per table; the engine reaches any of them by name.
/** @throws {TypeError} when the drizzle client has no such method */
const invokeDrizzle = (target: unknown, name: string, ...args: readonly unknown[]): unknown => {
  const method = fieldOf(target, name);
  if (typeof method !== 'function') throw new TypeError(`the drizzle client has no ${name}()`);
  return Reflect.apply(method, target, args);
};

/** @throws {Error} when the table has no column with the key */
export const columnOf = (table: Table, key: string): Column => {
  const column: unknown = getTableColumns(table)[key];
  if (!is(column, Column)) throw new Error(`the table has no column ${key}`);
  return column;
};

/** @throws {Error} when the table has no column with one of the keys */
export const conditionOf = (table: Table, conditions: Row): SQL | undefined =>
  and(...Object.entries(conditions).map(([key, value]) => eq(columnOf(table, key), value)));

export type SqlClient = {
  readonly findFirst: (queryKey: string, options: Row) => Promise<unknown>;
  readonly findMany: (queryKey: string, options: Row) => Promise<unknown>;
  readonly selectFirst: (table: Table, fields: Row, where: SQL | undefined) => Promise<unknown>;
  readonly insert: (table: Table, values: Row) => Promise<unknown>;
  readonly update: (table: Table, values: Row, where: SQL | undefined) => Promise<unknown>;
  readonly updateReturning: (
    table: Table,
    values: Row,
    where: SQL | undefined,
    returning: Row,
  ) => Promise<unknown>;
  readonly delete: (table: Table, where: SQL | undefined) => Promise<unknown>;
};

/** @throws {Error} when the client was created without the schema */
const relationalQuery = (client: unknown, queryKey: string): unknown => {
  const query = fieldOf(fieldOf(client, 'query'), queryKey);
  if (query === undefined) {
    throw new Error(`db.query.${queryKey} is missing. Create the drizzle client with the schema`);
  }
  return query;
};

// Every method is async, so a client that lacks a method fails the returned promise.
export const sqlClient = (client: unknown): SqlClient => ({
  findFirst: async (queryKey, options) =>
    invokeDrizzle(relationalQuery(client, queryKey), 'findFirst', options),
  findMany: async (queryKey, options) =>
    invokeDrizzle(relationalQuery(client, queryKey), 'findMany', options),
  selectFirst: async (table, fields, where) =>
    invokeDrizzle(
      invokeDrizzle(
        invokeDrizzle(invokeDrizzle(client, 'select', fields), 'from', table),
        'where',
        where,
      ),
      'limit',
      1,
    ),
  insert: async (table, values) =>
    invokeDrizzle(invokeDrizzle(client, 'insert', table), 'values', values),
  update: async (table, values, where) =>
    invokeDrizzle(
      invokeDrizzle(invokeDrizzle(client, 'update', table), 'set', values),
      'where',
      where,
    ),
  updateReturning: async (table, values, where, returning) =>
    invokeDrizzle(
      invokeDrizzle(
        invokeDrizzle(invokeDrizzle(client, 'update', table), 'set', values),
        'where',
        where,
      ),
      'returning',
      returning,
    ),
  delete: async (table, where) =>
    invokeDrizzle(invokeDrizzle(client, 'delete', table), 'where', where),
});
