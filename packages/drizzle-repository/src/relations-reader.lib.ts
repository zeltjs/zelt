import { getMeta } from 'drizzle-metadata';
import type { Column } from 'drizzle-orm';
import { getTableName, is, Relation, Table } from 'drizzle-orm';
import { err, ok, Result } from 'neverthrow';

import type { GenerationError, SchemaRelation } from './generation.types';
import './metadata';
import { fieldOf } from './row.lib';
import { keysByName } from './table-reader.lib';

type Exports = Readonly<Record<string, unknown>>;

const includedInDomain = (relation: unknown): boolean =>
  is(relation, Relation) && getMeta(relation)?.includedInDomain === true;

const keysOfColumns = (table: Table, columns: readonly Column[]): string[] => {
  const keyByName = keysByName(table);
  return columns.map((column) => keyByName.get(column.name) ?? column.name);
};

const relationError =
  (place: string) =>
  (cause: unknown): GenerationError => ({
    message: `${place}: ${cause instanceof Error ? cause.message : String(cause)}`,
  });

// Only a relation that builds a domain must point to exported tables; the generator reads no other.
const unresolved = (
  place: string,
  relation: unknown,
  table: Table,
): Result<SchemaRelation, GenerationError>[] =>
  includedInDomain(relation)
    ? [err({ message: `${place}: ${getTableName(table)} is not exported from the schema files` })]
    : [];

// drizzle 0.x reads the relations through its own extraction: it pairs a many relation with the
// opposite one relation by instance, and that pairing tells which columns the many relation uses.
// These functions exist only in drizzle 0.x, so they are read from the module loaded at run time.
export type DrizzleModule = typeof import('drizzle-orm');

export const readRelationsV0 = (
  orm: DrizzleModule,
  exports: Exports,
  tableNames: ReadonlyMap<Table, string>,
): Result<SchemaRelation[], GenerationError[]> => {
  // Extraction runs the relations() callbacks of every schema file, so no one relation is the place.
  const extracted = Result.fromThrowable(
    () => orm.extractTablesRelationalConfig(exports, orm.createTableRelationsHelpers),
    relationError('relations'),
  )();
  if (extracted.isErr()) return err([extracted.error]);
  const { tables, tableNamesMap } = extracted.value;
  const normalize = (place: string, relation: Relation) =>
    Result.fromThrowable(
      () => orm.normalizeRelation(tables, tableNamesMap, relation),
      relationError(place),
    )();
  // drizzle keys the tables by their export names.
  const read = (
    source: string,
    name: string,
    relation: Relation,
  ): Result<SchemaRelation, GenerationError>[] => {
    const target = tableNames.get(relation.referencedTable);
    if (target === undefined) {
      return unresolved(`${source}.${name}`, relation, relation.referencedTable);
    }
    const base = {
      source,
      name,
      target,
      many: is(relation, orm.Many),
      includedInDomain: includedInDomain(relation),
    };
    if (!base.includedInDomain) return [ok({ ...base, sourceColumns: [], targetColumns: [] })];
    return [
      normalize(`${source}.${name}`, relation).map((normalized) => ({
        ...base,
        sourceColumns: keysOfColumns(relation.sourceTable, normalized.fields),
        targetColumns: keysOfColumns(relation.referencedTable, normalized.references),
      })),
    ];
  };
  return Result.combineWithAllErrors(
    Object.entries(tables).flatMap(([source, config]) =>
      Object.entries(config.relations).flatMap(([name, relation]) => read(source, name, relation)),
    ),
  );
};

type TableRelationsV1 = { readonly table: Table; readonly relations: Exports };

const tableRelationsOf = (entry: unknown): TableRelationsV1 | undefined => {
  const table = fieldOf(entry, 'table');
  const relations = fieldOf(entry, 'relations');
  if (!is(table, Table) || typeof relations !== 'object' || relations === null) return undefined;
  return { table, relations: Object.fromEntries(Object.entries(relations)) };
};

// defineRelations() of drizzle 1.x returns { [tableKey]: { table, relations } }.
const relationsConfigV1 = (value: unknown): readonly TableRelationsV1[] | undefined => {
  if (typeof value !== 'object' || value === null || is(value, Table)) return undefined;
  const entries = Object.values(value).map(tableRelationsOf);
  if (entries.length === 0) return undefined;
  const configs = entries.flatMap((entry) => (entry === undefined ? [] : [entry]));
  return configs.length === entries.length ? configs : undefined;
};

const columnKeys = (columns: unknown): string[] =>
  (Array.isArray(columns) ? columns : []).flatMap((column: unknown) => {
    const key = fieldOf(fieldOf(column, '_'), 'key');
    return typeof key === 'string' ? [key] : [];
  });

const readRelationV1 = (
  sourceTable: Table,
  name: string,
  relation: unknown,
  tableNames: ReadonlyMap<Table, string>,
): Result<SchemaRelation, GenerationError>[] => {
  const source = tableNames.get(sourceTable);
  if (source === undefined) {
    return unresolved(`${getTableName(sourceTable)}.${name}`, relation, sourceTable);
  }
  const targetTable = fieldOf(relation, 'targetTable');
  if (!is(targetTable, Table)) return [];
  const target = tableNames.get(targetTable);
  if (target === undefined) return unresolved(`${source}.${name}`, relation, targetTable);
  return [
    ok({
      source,
      name,
      target,
      many: fieldOf(relation, 'relationType') === 'many',
      includedInDomain: includedInDomain(relation),
      sourceColumns: columnKeys(fieldOf(relation, 'sourceColumns')),
      targetColumns: columnKeys(fieldOf(relation, 'targetColumns')),
    }),
  ];
};

export const readRelationsV1 = (
  exports: Exports,
  tableNames: ReadonlyMap<Table, string>,
): Result<SchemaRelation[], GenerationError[]> =>
  Result.combineWithAllErrors(
    Object.values(exports)
      .flatMap((value) => relationsConfigV1(value) ?? [])
      .flatMap(({ table, relations }) =>
        Object.entries(relations).flatMap(([name, relation]) =>
          readRelationV1(table, name, relation, tableNames),
        ),
      ),
  );
