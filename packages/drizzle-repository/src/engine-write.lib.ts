import { and, eq } from 'drizzle-orm';
import type { ResultAsync } from 'neverthrow';

import type {
  ChildDefinition,
  DatabaseLike,
  Dialect,
  DomainDefinition,
} from './domain-definition.types';
import { findFirstRow, toDbError } from './engine-read.lib';
import { ConflictError, DbError } from './repository.errors';
import type { Row } from './repository.types';
import { rowsOf, toRow, valueKey } from './row.lib';
import type { Settled } from './settled.lib';
import { failed, succeeded, toResultAsync } from './settled.lib';
import type { SqlClient } from './sql-client.lib';
import { columnOf, sqlClient } from './sql-client.lib';

// Thrown inside the transaction so that every statement of the domain is rolled back.
class LockMismatch extends Error {}

const pick = (row: Row, columns: readonly string[]): Row => {
  const present = new Set(Object.keys(row));
  return Object.fromEntries(
    columns.filter((column) => present.has(column)).map((column) => [column, row[column]]),
  );
};

const changedColumns = (pre: Row, input: Row, columns: readonly string[]): Row =>
  Object.fromEntries(
    columns
      .filter((column) => valueKey(pre[column]) !== valueKey(input[column]))
      .map((column) => [column, input[column]]),
  );

/** @throws {Error} when the primary key is not a column of the table */
const byPrimaryKey = (shape: ChildDefinition, id: unknown) =>
  eq(columnOf(shape.table, shape.primaryKey), id);

// A row belongs to the parent it is nested in, so the parent's values replace whatever the input put in the link columns.
const linkedRowsOf = (parent: Row, child: ChildDefinition): readonly Row[] => {
  const { columns, parentColumns } = child.foreignKey;
  const link = Object.fromEntries(
    columns.map((column, index) => [column, parent[parentColumns[index] ?? '']]),
  );
  return rowsOf(parent[child.relation]).map((row) => ({ ...row, ...link }));
};

/** @throws {Error} when the database rejects a statement */
const insertTree = async (client: SqlClient, shape: ChildDefinition, row: Row): Promise<void> => {
  await client.insert(shape.table, pick(row, [...shape.columns, ...shape.foreignKey.columns]));
  for (const child of shape.children) {
    for (const childRow of linkedRowsOf(row, child)) await insertTree(client, child, childRow);
  }
};

/** @throws {Error} when the database rejects a statement */
const deleteTree = async (client: SqlClient, shape: ChildDefinition, row: Row): Promise<void> => {
  for (const child of shape.children) {
    for (const childRow of rowsOf(row[child.relation])) await deleteTree(client, child, childRow);
  }
  await client.delete(shape.table, byPrimaryKey(shape, row[shape.primaryKey]));
};

/** @throws {Error} when the database rejects a statement */
const updateRow = async (
  client: SqlClient,
  shape: ChildDefinition,
  pre: Row,
  input: Row,
): Promise<void> => {
  const changes = changedColumns(
    pre,
    input,
    shape.columns.filter((column) => column !== shape.primaryKey),
  );
  if (Object.keys(changes).length > 0) {
    await client.update(shape.table, changes, byPrimaryKey(shape, input[shape.primaryKey]));
  }
  await syncChildren(client, shape.children, pre, input);
};

// Compares the included rows by primary key and writes only the rows that were added, removed or changed.
/** @throws {Error} when the database rejects a statement */
const syncChildren = async (
  client: SqlClient,
  children: readonly ChildDefinition[],
  pre: Row,
  input: Row,
): Promise<void> => {
  for (const child of children) {
    const keyOf = (row: Row): string => valueKey(row[child.primaryKey]);
    const preRows = new Map(rowsOf(pre[child.relation]).map((row) => [keyOf(row), row]));
    const inputRows = new Map(linkedRowsOf(input, child).map((row) => [keyOf(row), row]));
    for (const [id, row] of preRows) {
      if (!inputRows.has(id)) await deleteTree(client, child, row);
    }
    for (const [id, row] of inputRows) {
      const preRow = preRows.get(id);
      if (preRow === undefined) await insertTree(client, child, row);
      else await updateRow(client, child, preRow, row);
    }
  }
};

// SQLite and PostgreSQL return the RETURNING rows; MySQL returns [ResultSetHeader, fields].
/** @throws {Error} when the MySQL driver does not report the updated rows */
const affectedRows = (dialect: Dialect, result: unknown): number => {
  if (!Array.isArray(result)) return 0;
  if (dialect !== 'mysql') return result.length;
  const count = toRow(result[0])?.['affectedRows'];
  if (typeof count !== 'number') {
    throw new Error('cannot read the number of updated rows from the MySQL driver');
  }
  return count;
};

/** @throws {Error} when the lock column does not hold a number */
const nextLockValue = (value: unknown): number => {
  if (typeof value !== 'number')
    throw new Error('the optimisticLock column does not hold a number');
  return value + 1;
};

// Advances the lock column only when it still has the value that was read; otherwise another process wrote first.
/** @throws {LockMismatch} when another process changed the lock column after the read
 * @throws {Error} from engine-write.lib.ts:affectedRows
 */
const advanceLock = async (
  domain: DomainDefinition,
  client: SqlClient,
  lockColumn: string,
  pre: Row,
  changes: Row,
): Promise<void> => {
  const primaryKey = columnOf(domain.table, domain.primaryKey);
  const values = { ...changes, [lockColumn]: nextLockValue(pre[lockColumn]) };
  const where = and(
    eq(primaryKey, pre[domain.primaryKey]),
    eq(columnOf(domain.table, lockColumn), pre[lockColumn]),
  );
  const result =
    domain.dialect === 'mysql'
      ? await client.update(domain.table, values, where)
      : await client.updateReturning(domain.table, values, where, { id: primaryKey });
  if (affectedRows(domain.dialect, result) !== 1) throw new LockMismatch();
};

const rootShape = (domain: DomainDefinition): ChildDefinition => ({
  relation: '',
  table: domain.table,
  primaryKey: domain.primaryKey,
  foreignKey: { columns: [], parentColumns: [] },
  columns: domain.columns,
  excludedColumns: domain.excludedColumns,
  children: domain.children,
});

/** @throws {Error} when the row is gone in the middle of the save */
const reread = async (domain: DomainDefinition, client: SqlClient, id: unknown): Promise<Row> => {
  const row = await findFirstRow(domain, client, { [domain.primaryKey]: id });
  if (row === undefined) {
    throw new Error(`${domain.name} ${String(id)} disappeared while it was being saved`);
  }
  return row;
};

/** @throws {Error} when the database rejects a statement
 * @throws {LockMismatch} from engine-write.lib.ts:advanceLock
 */
const updateRoot = async (
  domain: DomainDefinition,
  client: SqlClient,
  pre: Row,
  input: Row,
): Promise<void> => {
  const ownColumns = domain.columns.filter(
    (column) => column !== domain.primaryKey && column !== domain.lockColumn,
  );
  const changes = changedColumns(pre, input, ownColumns);
  if (domain.lockColumn !== undefined) {
    await advanceLock(domain, client, domain.lockColumn, pre, changes);
  } else if (Object.keys(changes).length > 0) {
    await client.update(
      domain.table,
      changes,
      byPrimaryKey(rootShape(domain), input[domain.primaryKey]),
    );
  }
  await syncChildren(client, domain.children, pre, input);
};

/**
 * @throws {Error} when the database rejects a statement
 * @throws {LockMismatch} when another process changed the lock column after the read
 */
const saveDomain = async (
  domain: DomainDefinition,
  db: DatabaseLike,
  pre: Row | null,
  input: Row,
): Promise<Row> => {
  const client = sqlClient(db.client);
  if (pre === null) await insertTree(client, rootShape(domain), input);
  else await updateRoot(domain, client, pre, input);
  // The client is taken when the transaction starts: without an async context, a later read of
  // db.client would leave the transaction.
  // Re-reading returns the values the database decided: defaults and the advanced lock column.
  return reread(domain, client, input[domain.primaryKey]);
};

/**
 * @throws {Error} when the database rejects a statement
 * @throws {LockMismatch} when another process changed the lock column after the read
 */
const removeDomain = async (
  domain: DomainDefinition,
  db: DatabaseLike,
  model: Row,
): Promise<void> => {
  const client = sqlClient(db.client);
  const id = model[domain.primaryKey];
  if (domain.lockColumn !== undefined) {
    await advanceLock(domain, client, domain.lockColumn, model, {});
  }
  const current = await findFirstRow(domain, client, { [domain.primaryKey]: id });
  if (current === undefined) return;
  await deleteTree(client, rootShape(domain), current);
};

// A statement that fails rejects the transaction, so every statement of the domain is rolled back.
const writeFailure = (domain: DomainDefinition, id: unknown, cause: unknown) =>
  failed(cause instanceof LockMismatch ? new ConflictError(domain.name, id) : toDbError(cause));

const settleSave = async (
  domain: DomainDefinition,
  db: DatabaseLike,
  pre: Row | null,
  input: Row,
): Promise<Settled<Row, ConflictError | DbError>> => {
  const id = input[domain.primaryKey];
  // The update is keyed by the id of input, so a different id would write pre's changes onto another row.
  if (pre !== null && valueKey(pre[domain.primaryKey]) !== valueKey(id)) {
    const cause = new Error(
      `${domain.name}: pre has ${domain.primaryKey} ${String(pre[domain.primaryKey])} but input has ${String(id)}`,
    );
    return failed(new DbError({ cause }));
  }
  try {
    return succeeded(await db.withTransaction(async () => saveDomain(domain, db, pre, input)));
  } catch (cause) {
    return writeFailure(domain, id, cause);
  }
};

export const save = (
  domain: DomainDefinition,
  db: DatabaseLike,
  value: { readonly pre: Row | null; readonly input: Row },
): ResultAsync<Row, ConflictError | DbError> =>
  toResultAsync(settleSave(domain, db, value.pre, value.input));

const settleRemove = async (
  domain: DomainDefinition,
  db: DatabaseLike,
  model: Row,
): Promise<Settled<void, ConflictError | DbError>> => {
  try {
    await db.withTransaction(async () => removeDomain(domain, db, model));
    return succeeded(undefined);
  } catch (cause) {
    return writeFailure(domain, model[domain.primaryKey], cause);
  }
};

export const remove = (
  domain: DomainDefinition,
  db: DatabaseLike,
  model: Row,
): ResultAsync<void, ConflictError | DbError> => toResultAsync(settleRemove(domain, db, model));
