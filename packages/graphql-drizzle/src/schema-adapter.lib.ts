import type { Column, Table } from 'drizzle-orm';
import { getTableColumns, is } from 'drizzle-orm';
import { getTableConfig as getPgConfig, PgTable } from 'drizzle-orm/pg-core';
import { getTableConfig as getSqliteConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { GeneratedExport } from './generated-module.lib';
import { generatedExports } from './generated-module.lib';
import type { TableGraphqlMeta } from './metadata.lib';
import { readColumnGraphqlMeta, readTableGraphqlMeta } from './metadata.lib';
import type { DrizzleSchema, ReadRelation, SchemaTable } from './relations-adapter.lib';
import { createRelationsReader, identifyDrizzleSchema } from './relations-adapter.lib';
import type { Model, ModelRelation, ReadResult, SchemaError, SchemaResult } from './schema.types';
import { readDrizzle } from './schema-result.lib';

const pascalCase = (name: string): string =>
  name.replace(/(?:^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_match: string, letter: string) =>
    letter.toUpperCase(),
  );

const columnKey = (table: Table, column: Column): string | undefined => {
  // Drizzle's types accept a column of any table with the same SQL name, so ownership is checked here.
  if (column.table !== table) return undefined;
  // PostgreSQL creates separate extra-config columns for table-level constraints.
  return Object.entries(getTableColumns(table)).find(
    ([, value]) => value.name === column.name,
  )?.[0];
};

// Names a column by its key in the table that owns it, as the schema author wrote it.
const columnLabel = (column: Column): string => columnKey(column.table, column) ?? column.name;

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

const NAME_RULE = '(letters, digits and "_", not starting with a digit or "__")';
const RENAME_HINT =
  'Set a different name with .meta({ graphqlName: ... }) on the table in the schema.';

// Built-in scalars and root operation types already own these names in every GraphQL schema.
const reservedTypeNames: ReadonlySet<string> = new Set([
  'ID',
  'String',
  'Int',
  'Float',
  'Boolean',
  'Query',
  'Mutation',
  'Subscription',
]);

// The model name becomes `export interface <name>` and a type reference in the generated module.
// model-names.integration.test.ts checks this list against every TypeScript keyword.
const typescriptUnusableNames: ReadonlySet<string> = new Set(
  [
    // ECMAScript reserved words, including those reserved in strict mode and modules.
    'break case catch class const continue debugger default delete do else enum export extends',
    'false finally for function if import in instanceof new null return super switch this throw',
    'true try typeof var void while with await yield',
    'implements interface let package private protected public static',
    // TypeScript's predefined type names (TS2427).
    'any unknown never number bigint boolean string symbol object undefined',
    // Type operators, which cannot start a type reference.
    'infer keyof readonly unique',
  ]
    .join(' ')
    .split(' '),
);

const readModelName = (exportName: string, meta: TableGraphqlMeta): ReadResult<string> => {
  const name = meta.name ?? pascalCase(exportName);
  if (!validName(name))
    return {
      kind: 'error',
      message: `Table "${exportName}" has an invalid GraphQL type name "${name}" ${NAME_RULE}. ${RENAME_HINT}`,
    };
  if (reservedTypeNames.has(name))
    return {
      kind: 'error',
      message: `Table "${exportName}" uses the GraphQL type name "${name}", which GraphQL reserves. ${RENAME_HINT}`,
    };
  if (typescriptUnusableNames.has(name))
    return {
      kind: 'error',
      message: `Table "${exportName}" uses the GraphQL type name "${name}", which TypeScript reserves and the generated model interface cannot take. ${RENAME_HINT}`,
    };
  return { kind: 'success', value: name };
};

// The primary key is always exposed as `id`; hidden columns become `$`-prefixed properties,
// which GraphQL never sees, so only the remaining keys have to be GraphQL names.
const readColumnProperty = (
  exportName: string,
  key: string,
  hidden: boolean,
  primaryKey: string,
): ReadResult<string> => {
  if (key === primaryKey && hidden)
    return {
      kind: 'error',
      message: `Table "${exportName}" marks primary key column "${key}" as hidden. Remove graphqlHidden from its .meta() because the primary key is exposed as "id".`,
    };
  if (key === primaryKey) return { kind: 'success', value: 'id' };
  if (hidden) return { kind: 'success', value: `$${key}` };
  return validName(key)
    ? { kind: 'success', value: key }
    : {
        kind: 'error',
        message: `Table "${exportName}" exposes the column key "${key}", which is not a valid GraphQL field name ${NAME_RULE}. Rename the key in the table definition, or hide the column with .meta({ graphqlHidden: true }).`,
      };
};

const readColumns = (
  exportName: string,
  table: Table,
  primaryKey: string,
): ReadResult<Model['columns']> => {
  const columns: { key: string; property: string }[] = [];
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    const meta = readColumnGraphqlMeta(column);
    if (meta.kind === 'error') return meta;
    const property = readColumnProperty(exportName, key, meta.value.hidden, primaryKey);
    if (property.kind === 'error') return property;
    columns.push({ key, property: property.value });
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
  if (key === undefined)
    return {
      kind: 'error',
      message: `Table "${exportName}" has a primary key column "${columnLabel(pk)}" that does not belong to it.`,
    };
  // A table-level primaryKey() leaves the column nullable in Drizzle's row type, which ID<T> rejects.
  if (!pk.notNull)
    return {
      kind: 'error',
      message: `Table "${exportName}" must have a non-null primary key: add .notNull() to column "${key}", or use the column-level .primaryKey().`,
    };
  if (key !== 'id' && Object.keys(getTableColumns(table)).includes('id'))
    return {
      kind: 'error',
      message: `Table "${exportName}" has a non-primary-key column named "id".`,
    };
  return { kind: 'success', value: key };
};

const readModel = ({ exportName, table, meta }: PublicTable): ReadResult<Model> => {
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
  const name = readModelName(exportName, meta);
  if (name.kind === 'error') return name;
  const columns = readColumns(exportName, table, primaryKey);
  if (columns.kind === 'error') return columns;
  return {
    kind: 'success',
    value: {
      name: name.value,
      exportName,
      dialect: shape.dialect,
      primaryKey,
      columns: columns.value,
      relations: [],
    },
  };
};

const foreignColumn = (key: string, column: Column, exportName: string): SchemaError => ({
  kind: 'error',
  message: `Relation "${key}" joins on a column "${columnLabel(column)}" that does not belong to table "${exportName}".`,
});

const readJoins = (
  source: Model,
  sourceTable: Table,
  relation: ReadRelation,
  target: Model,
): ReadResult<ModelRelation['joins']> => {
  const joins: { source: string; target: string }[] = [];
  for (const [index, field] of relation.fields.entries()) {
    const reference = relation.references[index];
    if (!reference)
      return { kind: 'error', message: `Relation "${relation.key}" has mismatched join columns.` };
    const sourceKey = columnKey(sourceTable, field);
    if (sourceKey === undefined) return foreignColumn(relation.key, field, source.exportName);
    const targetKey = columnKey(relation.targetTable, reference);
    if (targetKey === undefined) return foreignColumn(relation.key, reference, target.exportName);
    joins.push({ source: sourceKey, target: targetKey });
  }
  return { kind: 'success', value: joins };
};

const readModelRelation = (
  source: Model,
  sourceTable: Table,
  relation: ReadRelation,
  target: Model,
): ReadResult<ModelRelation> => {
  if (relation.fields.length !== relation.references.length || relation.fields.length === 0)
    return { kind: 'error', message: `Relation "${relation.key}" has mismatched join columns.` };
  const joins = readJoins(source, sourceTable, relation, target);
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

// A table's GraphQL metadata is read once here; both whether it is exposed and what it is named follow it.
type PublicTable = SchemaTable & { readonly meta: TableGraphqlMeta };

// Hidden tables stay in the Drizzle schema used for relation inference.
const publicTables = (tables: readonly SchemaTable[]): ReadResult<readonly PublicTable[]> => {
  const visible: PublicTable[] = [];
  for (const entry of tables) {
    const meta = readTableGraphqlMeta(entry.table);
    if (meta.kind === 'error') return meta;
    if (!meta.value.hidden) visible.push({ ...entry, meta: meta.value });
  }
  return { kind: 'success', value: visible };
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
    if (!validName(relation.key))
      return {
        kind: 'error',
        message: `Table "${model.exportName}" has the relation key "${relation.key}", which is not a valid GraphQL field name ${NAME_RULE}. Rename the key in relations().`,
      };
    const result = readModelRelation(model, table, relation, target);
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

type ExportedName = { readonly exportName: string; readonly role: GeneratedExport['role'] };

const describeOwner = ({ exportName, role }: ExportedName): string =>
  role === 'type'
    ? `the GraphQL type name of table "${exportName}"`
    : `the resolver class generated for table "${exportName}"`;

// The generated module exports each model and its resolver, so both share one namespace.
const claimExportedNames = (
  model: Model,
  claimed: Map<string, ExportedName>,
): SchemaError | undefined => {
  const wanted = generatedExports(model.name).map(
    ({ name, role }) => [name, { exportName: model.exportName, role }] as const,
  );
  for (const [name, owner] of wanted) {
    const existing = claimed.get(name);
    if (existing)
      return {
        kind: 'error',
        message: `${existing.role === 'type' && owner.role === 'type' ? 'Duplicate GraphQL type name' : 'Duplicate export name in the generated module'} "${name}": it is both ${describeOwner(existing)} and ${describeOwner(owner)}. ${RENAME_HINT}`,
      };
  }
  for (const [name, owner] of wanted) claimed.set(name, owner);
  return undefined;
};

const readModels = (tables: readonly PublicTable[]): ReadResult<ReadonlyMap<Table, Model>> => {
  const byTable = new Map<Table, Model>();
  const exportedNames = new Map<string, ExportedName>();
  for (const entry of tables) {
    const result = readModel(entry);
    if (result.kind === 'error') return result;
    const model = result.value;
    const clash = claimExportedNames(model, exportedNames);
    if (clash) return clash;
    byTable.set(entry.table, model);
  }
  return { kind: 'success', value: byTable };
};

const readModelsWithRelations = (drizzle: DrizzleSchema): SchemaResult => {
  const tables = publicTables(drizzle.tables);
  if (tables.kind === 'error') return tables;
  const read = readModels(tables.value);
  if (read.kind === 'error') return read;
  const byTable = read.value;
  const reader = createRelationsReader(drizzle);
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

export const readSchema = (schema: Record<string, unknown>): SchemaResult =>
  readModelsWithRelations(identifyDrizzleSchema(schema));
