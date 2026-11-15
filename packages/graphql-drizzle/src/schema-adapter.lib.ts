import type { Column, Table } from 'drizzle-orm';
import { Table as DrizzleTable, getTableColumns, is } from 'drizzle-orm';
import { getTableConfig as getPgConfig, PgTable } from 'drizzle-orm/pg-core';
import { getTableConfig as getSqliteConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { readGraphqlMeta } from './metadata.lib';
import type { ReadRelation } from './relations-adapter.lib';
import { createRelationsReader } from './relations-adapter.lib';
import type { Model, ModelRelation, ReadResult, SchemaResult } from './schema.types';
import { readDrizzle } from './schema-result.lib';

const pascalCase = (name: string): string =>
  name.replace(/(?:^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_match: string, letter: string) =>
    letter.toUpperCase(),
  );

const columnKey = (table: Table, column: Column): ReadResult<string> => {
  // PostgreSQL creates separate extra-config columns for table-level constraints.
  const entry = Object.entries(getTableColumns(table)).find(
    ([, value]) => value.name === column.name,
  );
  return entry
    ? { kind: 'success', value: entry[0] }
    : { kind: 'error', message: `Relation column "${column.name}" does not belong to its table.` };
};

const tableShape = (table: Table) => {
  if (is(table, PgTable)) return { dialect: 'pg', config: getPgConfig(table) } as const;
  if (is(table, SQLiteTable)) return { dialect: 'sqlite', config: getSqliteConfig(table) } as const;
  return undefined;
};

const singlePrimaryKey = (config: {
  readonly columns: readonly Column[];
  readonly primaryKeys: readonly { readonly columns: readonly Column[] }[];
}): Column | undefined => {
  const inlineKeys = config.columns.filter((column) => column.primary);
  const keys = [
    ...inlineKeys.map((column) => [column]),
    ...config.primaryKeys.map((key) => key.columns),
  ];
  const [primary] = keys;
  if (keys.length !== 1 || primary?.length !== 1) return undefined;
  return primary[0];
};

const validName = (name: string): boolean =>
  /^[_A-Za-z][_0-9A-Za-z]*$/.test(name) && !name.startsWith('__');

const readModelName = (exportName: string, table: Table): ReadResult<string> => {
  const meta = readGraphqlMeta(table);
  if (meta.kind === 'error') return meta;
  const name = meta.value.name ?? pascalCase(exportName);
  return validName(name)
    ? { kind: 'success', value: name }
    : {
        kind: 'error',
        message: `Table "${exportName}" has an invalid GraphQL type name "${name}".`,
      };
};

const readColumns = (table: Table, primaryKey: string): ReadResult<Model['columns']> => {
  const columns: { key: string; property: string }[] = [];
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    const meta = readGraphqlMeta(column);
    if (meta.kind === 'error') return meta;
    columns.push({
      key,
      property: key === primaryKey ? 'id' : `${meta.value.hidden ? '$' : ''}${key}`,
    });
  }
  return { kind: 'success', value: columns };
};

const readPrimaryKey = (
  exportName: string,
  table: Table,
  config: Parameters<typeof singlePrimaryKey>[0],
): ReadResult<string> => {
  const pk = singlePrimaryKey(config);
  if (!pk)
    return {
      kind: 'error',
      message: `Table "${exportName}" must have a single-column primary key.`,
    };
  if (pk.dataType !== 'string')
    return {
      kind: 'error',
      message: `Table "${exportName}" must have a string primary key; got ${pk.dataType}.`,
    };
  const key = columnKey(table, pk);
  if (key.kind === 'error') return key;
  if (key.value !== 'id' && Object.keys(getTableColumns(table)).includes('id'))
    return {
      kind: 'error',
      message: `Table "${exportName}" has a non-primary-key column named "id".`,
    };
  return key;
};

const readModel = (exportName: string, table: Table): ReadResult<Model> => {
  const result = readDrizzle(() => tableShape(table));
  if (result.kind === 'error') return result;
  const shape = result.value;
  if (!shape)
    return {
      kind: 'error',
      message: `Table "${exportName}": only PostgreSQL and SQLite are supported.`,
    };
  const key = readPrimaryKey(exportName, table, shape.config);
  if (key.kind === 'error') return key;
  const primaryKey = key.value;
  const name = readModelName(exportName, table);
  if (name.kind === 'error') return name;
  const columns = readColumns(table, primaryKey);
  if (columns.kind === 'error') return columns;
  return {
    kind: 'success',
    value: {
      name: name.value,
      exportName,
      rowName: `${pascalCase(exportName)}Row`,
      dialect: shape.dialect,
      primaryKey,
      columns: columns.value,
      relations: [],
    },
  };
};

const readJoins = (source: Table, relation: ReadRelation): ReadResult<ModelRelation['joins']> => {
  const joins: { source: string; target: string }[] = [];
  for (const [index, field] of relation.fields.entries()) {
    const reference = relation.references[index];
    if (!reference)
      return { kind: 'error', message: `Relation "${relation.key}" has mismatched join columns.` };
    const sourceKey = columnKey(source, field);
    if (sourceKey.kind === 'error') return sourceKey;
    const targetKey = columnKey(relation.targetTable, reference);
    if (targetKey.kind === 'error') return targetKey;
    joins.push({ source: sourceKey.value, target: targetKey.value });
  }
  return { kind: 'success', value: joins };
};

const readModelRelation = (
  source: Table,
  relation: ReadRelation,
  target: Model,
): ReadResult<ModelRelation> => {
  if (relation.fields.length !== relation.references.length || relation.fields.length === 0)
    return { kind: 'error', message: `Relation "${relation.key}" has mismatched join columns.` };
  const joins = readJoins(source, relation);
  if (joins.kind === 'error') return joins;
  return {
    kind: 'success',
    value: {
      key: relation.key,
      target: target.name,
      targetExport: target.exportName,
      targetPrimaryKey: target.primaryKey,
      joins: joins.value,
      ...(relation.kind === 'many'
        ? { kind: 'many' }
        : { kind: 'one', nullable: relation.nullable }),
    },
  };
};

const publicTables = (
  schema: Record<string, unknown>,
): ReadResult<readonly { exportName: string; table: Table }[]> => {
  const tables: { exportName: string; table: Table }[] = [];
  for (const [exportName, table] of Object.entries(schema)) {
    if (!is(table, DrizzleTable)) continue;
    const meta = readGraphqlMeta(table);
    if (meta.kind === 'error') return meta;
    if (!meta.value.hidden) tables.push({ exportName, table });
  }
  return { kind: 'success', value: tables };
};

const attachRelations = (
  table: Table,
  model: Model,
  relations: readonly ReadRelation[],
  models: ReadonlyMap<Table, Model>,
): ReadResult<Model> => {
  const clash = relations.find((relation) =>
    model.columns.some((column) => column.key === relation.key || column.property === relation.key),
  );
  if (clash)
    return {
      kind: 'error',
      message: `Table "${model.exportName}" has a column/relation key clash at "${clash.key}".`,
    };
  const attached: ModelRelation[] = [];
  for (const relation of relations) {
    const target = models.get(relation.targetTable);
    if (!target) continue;
    const result = readModelRelation(table, relation, target);
    if (result.kind === 'error') return result;
    attached.push(result.value);
  }
  return {
    kind: 'success',
    value: {
      ...model,
      relations: attached,
    },
  };
};

const readModels = (schema: Record<string, unknown>): ReadResult<ReadonlyMap<Table, Model>> => {
  const byTable = new Map<Table, Model>();
  const names = new Set<string>();
  const tables = publicTables(schema);
  if (tables.kind === 'error') return tables;
  for (const { exportName, table } of tables.value) {
    const result = readModel(exportName, table);
    if (result.kind === 'error') return result;
    const model = result.value;
    if (names.has(model.name))
      return { kind: 'error', message: `Duplicate GraphQL type name "${model.name}".` };
    names.add(model.name);
    byTable.set(table, model);
  }
  return { kind: 'success', value: byTable };
};

export const readSchema = (schema: Record<string, unknown>): SchemaResult => {
  const tables = readModels(schema);
  if (tables.kind === 'error') return tables;
  const byTable = tables.value;
  const reader = createRelationsReader(schema);
  if (reader.kind === 'error') return reader;
  const models: Model[] = [];
  for (const [table, model] of byTable) {
    const relations = reader.value(model.exportName, (target) => byTable.has(target));
    if (relations.kind === 'error') return relations;
    const result = attachRelations(table, model, relations.value, byTable);
    if (result.kind === 'error') return result;
    models.push(result.value);
  }
  return { kind: 'success', models };
};
