import { and, eq } from 'drizzle-orm';
import type { ResultAsync } from 'neverthrow';

import type { ChildDefinition, DatabaseLike, DomainDefinition } from './domain-definition.types';
import { NOT_EXIST } from './not-exist.lib';
import { DbError, EntityNotFoundError } from './repository.errors';
import type { Row } from './repository.types';
import { rowsOf, toRow } from './row.lib';
import type { Settled } from './settled.lib';
import { failed, succeeded, toResultAsync } from './settled.lib';
import type { SqlClient } from './sql-client.lib';
import { columnOf, conditionOf, sqlClient } from './sql-client.lib';
import {
  findStagedByPrimaryKey,
  findStagedByUniqueKey,
  registerStagingDefinition,
} from './staging.lib';

export const toDbError = (cause: unknown): DbError => new DbError({ cause });

export const defineDomain = (definition: DomainDefinition): DomainDefinition => {
  registerStagingDefinition(definition.name, {
    primaryKey: definition.primaryKey,
    uniqueKeys: definition.uniqueKeys,
  });
  return definition;
};

type Shape = {
  readonly excludedColumns: readonly string[];
  readonly children: readonly ChildDefinition[];
};

const shapeOption = (shape: Shape): Row => {
  const option: Record<string, unknown> = {};
  if (shape.excludedColumns.length > 0) {
    option['columns'] = Object.fromEntries(shape.excludedColumns.map((key) => [key, false]));
  }
  if (shape.children.length > 0) {
    option['with'] = Object.fromEntries(
      shape.children.map((child) => [child.relation, shapeOption(child)]),
    );
  }
  return option;
};

// Relational queries return the domain and its included tables in one statement.
// Drizzle 0.x takes a SQL condition; 1.x takes an object filter.
/** @throws {Error} when the table has no column with one of the keys */
const whereOption = (domain: DomainDefinition, conditions: Row): unknown => {
  if (domain.drizzleMajor === 1) return conditions;
  const parts = Object.entries(conditions).map(([key, value]) =>
    eq(columnOf(domain.table, key), value),
  );
  return parts.length === 1 ? parts[0] : and(...parts);
};

/** @throws {Error} when the table has no column with one of the keys */
export const queryOptions = (domain: DomainDefinition, conditions: Row): Row => ({
  ...shapeOption(domain),
  where: whereOption(domain, conditions),
});

/** @throws {Error} when the database rejects the query or the definition does not match the table */
const selectPrimaryKey = async (
  domain: DomainDefinition,
  db: DatabaseLike,
  conditions: Row,
): Promise<unknown> => {
  const rows = await sqlClient(db.client).selectFirst(
    domain.table,
    { id: columnOf(domain.table, domain.primaryKey) },
    conditionOf(domain.table, conditions),
  );
  return rowsOf(rows)[0]?.['id'];
};

/** @throws {Error} when the database rejects the query or the definition does not match the table */
export const findFirstRow = async (
  domain: DomainDefinition,
  client: SqlClient,
  conditions: Row,
): Promise<Row | undefined> =>
  toRow(await client.findFirst(domain.queryKey, queryOptions(domain, conditions)));

const settleIsExisted = async (
  domain: DomainDefinition,
  db: DatabaseLike,
  id: unknown,
): Promise<Settled<unknown, DbError>> => {
  try {
    const staged = findStagedByPrimaryKey(domain.name, id);
    if (staged !== undefined) return succeeded(staged.kind === 'save' ? id : NOT_EXIST);
    const found = await selectPrimaryKey(domain, db, { [domain.primaryKey]: id });
    return succeeded(found === undefined ? NOT_EXIST : found);
  } catch (cause) {
    return failed(toDbError(cause));
  }
};

export const isExisted = (
  domain: DomainDefinition,
  db: DatabaseLike,
  id: unknown,
): ResultAsync<unknown, DbError> => toResultAsync(settleIsExisted(domain, db, id));

const settleGetById = async (
  domain: DomainDefinition,
  db: DatabaseLike,
  id: unknown,
): Promise<Settled<Row, EntityNotFoundError | DbError>> => {
  try {
    const staged = findStagedByPrimaryKey(domain.name, id);
    if (staged !== undefined) {
      return staged.kind === 'save'
        ? succeeded(staged.model)
        : failed(new EntityNotFoundError(domain.name, id));
    }
    const row = await findFirstRow(domain, sqlClient(db.client), { [domain.primaryKey]: id });
    return row === undefined ? failed(new EntityNotFoundError(domain.name, id)) : succeeded(row);
  } catch (cause) {
    return failed(toDbError(cause));
  }
};

export const getById = (
  domain: DomainDefinition,
  db: DatabaseLike,
  id: unknown,
): ResultAsync<Row, EntityNotFoundError | DbError> => toResultAsync(settleGetById(domain, db, id));

/** @throws {Error} when the database rejects the query or the domain has no such unique key */
const checkUniqueKey = async (
  domain: DomainDefinition,
  db: DatabaseLike,
  uniqueKey: string,
  key: Row,
): Promise<Row> => {
  const definition = domain.uniqueKeys.find((candidate) => candidate.name === uniqueKey);
  if (definition === undefined) throw new Error(`${domain.name} has no unique key ${uniqueKey}`);
  const values = definition.columns.map((column) => key[column]);
  const notExist: Row = { ...key, id: NOT_EXIST };

  const staged = findStagedByUniqueKey(domain.name, uniqueKey, values);
  if (staged?.kind === 'save') return { id: staged.model[domain.primaryKey] };

  const found = await selectPrimaryKey(domain, db, key);
  if (found === undefined) return notExist;
  // A staged change of the same row wins over the stored key: it was deleted, or its key was changed.
  if (findStagedByPrimaryKey(domain.name, found) !== undefined) return notExist;
  return { id: found };
};

const settleIsExistedBy = async (
  domain: DomainDefinition,
  db: DatabaseLike,
  uniqueKey: string,
  key: Row,
): Promise<Settled<Row, DbError>> => {
  try {
    return succeeded(await checkUniqueKey(domain, db, uniqueKey, key));
  } catch (cause) {
    return failed(toDbError(cause));
  }
};

export const isExistedBy = (
  domain: DomainDefinition,
  db: DatabaseLike,
  uniqueKey: string,
  key: Row,
): ResultAsync<Row, DbError> => toResultAsync(settleIsExistedBy(domain, db, uniqueKey, key));

const settleFindBy = async (
  domain: DomainDefinition,
  db: DatabaseLike,
  key: Row,
): Promise<Settled<readonly Row[], DbError>> => {
  try {
    const rows = await sqlClient(db.client).findMany(domain.queryKey, queryOptions(domain, key));
    return succeeded(rowsOf(rows));
  } catch (cause) {
    return failed(toDbError(cause));
  }
};

export const findBy = (
  domain: DomainDefinition,
  db: DatabaseLike,
  key: Row,
): ResultAsync<readonly Row[], DbError> => toResultAsync(settleFindBy(domain, db, key));
