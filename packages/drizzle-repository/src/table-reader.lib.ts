import { getMeta } from 'drizzle-metadata';
import type { Column, Table } from 'drizzle-orm';
import { entityKind, getTableColumns, getTableName, is } from 'drizzle-orm';
import { err, ok, Result } from 'neverthrow';

import type { Dialect } from './domain-definition.types';
import type {
  GenerationError,
  SchemaColumn,
  SchemaForeignKey,
  SchemaTable,
} from './generation.types';
import './metadata';

// The common part of getTableConfig() of the supported dialects.
type TableConfig = {
  readonly columns: readonly Column[];
  readonly primaryKeys: readonly { readonly columns: readonly Column[] }[];
  readonly uniqueConstraints: readonly { readonly columns: readonly Column[] }[];
  readonly indexes: readonly {
    readonly config: {
      readonly unique?: boolean | undefined;
      readonly where?: unknown;
      readonly columns: readonly unknown[];
    };
  }[];
  readonly foreignKeys: readonly {
    reference(): {
      readonly columns: readonly Column[];
      readonly foreignTable: Table;
      readonly foreignColumns: readonly Column[];
    };
  }[];
};

export type DialectReader = {
  readonly dialect: Dialect;
  readonly owns: (table: Table) => boolean;
  readonly config: (table: Table) => TableConfig | undefined;
};

// The engine's writes (RETURNING, affected rows) are checked only on these databases.
export const loadDialectReaders = async (): Promise<readonly DialectReader[]> => {
  const [sqlite, pg, mysql] = await Promise.all([
    import('drizzle-orm/sqlite-core'),
    import('drizzle-orm/pg-core'),
    import('drizzle-orm/mysql-core'),
  ]);
  return [
    {
      dialect: 'sqlite',
      owns: (table) => is(table, sqlite.SQLiteTable),
      config: (table) => (is(table, sqlite.SQLiteTable) ? sqlite.getTableConfig(table) : undefined),
    },
    {
      dialect: 'pg',
      owns: (table) => is(table, pg.PgTable),
      config: (table) => (is(table, pg.PgTable) ? pg.getTableConfig(table) : undefined),
    },
    {
      dialect: 'mysql',
      owns: (table) => is(table, mysql.MySqlTable),
      config: (table) => (is(table, mysql.MySqlTable) ? mysql.getTableConfig(table) : undefined),
    },
  ];
};

const readTableConfig = (
  exportName: string,
  table: Table,
  readers: readonly DialectReader[],
): Result<{ readonly dialect: Dialect; readonly config: TableConfig }, GenerationError> => {
  const reader = readers.find((candidate) => candidate.owns(table));
  const config = reader?.config(table);
  if (reader === undefined || config === undefined) {
    const kind: unknown = Reflect.get(table.constructor, entityKind);
    return err({
      message: `${exportName}: ${String(kind ?? '')} is not supported. Use a SQLite, PostgreSQL or MySQL table`,
    });
  }
  return ok({ dialect: reader.dialect, config });
};

export const keysByName = (table: Table): ReadonlyMap<string, string> =>
  new Map(Object.entries(getTableColumns(table)).map(([key, column]) => [column.name, key]));

// An index may list SQL expressions; only plain columns make a key.
const columnName = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const name: unknown = Reflect.get(value, 'name');
  return typeof name === 'string' ? name : undefined;
};

const readColumn = (column: Column, keyByName: ReadonlyMap<string, string>): SchemaColumn => {
  const meta = getMeta(column);
  return {
    key: keyByName.get(column.name) ?? column.name,
    notNull: column.notNull,
    isNumber: column.dataType === 'number' || column.dataType.startsWith('number'),
    excludedFromModel: meta?.excludedFromModel === true,
    optimisticLock: meta?.optimisticLock === true,
  };
};

const readForeignKeys = (
  exportName: string,
  config: TableConfig,
  tableNames: ReadonlyMap<Table, string>,
  keysOf: (columns: readonly unknown[]) => readonly string[] | undefined,
): Result<SchemaForeignKey[], GenerationError[]> =>
  Result.combineWithAllErrors(
    config.foreignKeys.flatMap((foreignKey): Result<SchemaForeignKey, GenerationError>[] => {
      const reference = foreignKey.reference();
      const columnKeys = keysOf(reference.columns);
      if (columnKeys === undefined) return [];
      const target = tableNames.get(reference.foreignTable);
      if (target === undefined) {
        return [
          err({
            message: `${exportName}.${columnKeys.join(', ')}: the foreign key points to ${getTableName(reference.foreignTable)}, which is not exported from the schema files`,
          }),
        ];
      }
      const foreignKeyOf = keysByName(reference.foreignTable);
      return [
        ok({
          columns: columnKeys,
          table: target,
          foreignColumns: reference.foreignColumns.map(
            (column) => foreignKeyOf.get(column.name) ?? column.name,
          ),
        }),
      ];
    }),
  );

const readUniqueKeys = (
  config: TableConfig,
  keysOf: (columns: readonly unknown[]) => readonly string[] | undefined,
): (readonly string[])[] =>
  [
    ...config.columns.filter((column) => column.isUnique).map((column) => keysOf([column])),
    ...config.uniqueConstraints.map((constraint) => keysOf(constraint.columns)),
    // An index with a condition or an expression does not make a plain key.
    ...config.indexes
      .filter((index) => index.config.unique === true && index.config.where === undefined)
      .map((index) => keysOf(index.config.columns)),
  ].flatMap((key) => (key === undefined ? [] : [key]));

const readPrimaryKey = (
  config: TableConfig,
  keyByName: ReadonlyMap<string, string>,
  keysOf: (columns: readonly unknown[]) => readonly string[] | undefined,
): readonly string[] => {
  const [declared] = config.primaryKeys;
  if (declared !== undefined) return keysOf(declared.columns) ?? [];
  return config.columns
    .filter((column) => column.primary)
    .map((column) => keyByName.get(column.name) ?? column.name);
};

export const readTable = (
  exportName: string,
  table: Table,
  tableNames: ReadonlyMap<Table, string>,
  readers: readonly DialectReader[],
): Result<SchemaTable, GenerationError[]> =>
  readTableConfig(exportName, table, readers)
    .mapErr((error) => [error])
    .andThen(({ dialect, config }) => {
      // Matched by database name: pg builds new column objects for constraints declared on the table.
      const keyByName = keysByName(table);
      const keysOf = (columns: readonly unknown[]): readonly string[] | undefined => {
        const keys = columns.flatMap((column) => {
          const name = columnName(column);
          const key = name === undefined ? undefined : keyByName.get(name);
          return key === undefined ? [] : [key];
        });
        return keys.length === columns.length ? keys : undefined;
      };
      return readForeignKeys(exportName, config, tableNames, keysOf).map((foreignKeys) => ({
        exportName,
        table,
        dialect,
        columns: config.columns.map((column) => readColumn(column, keyByName)),
        primaryKey: readPrimaryKey(config, keyByName, keysOf),
        uniqueKeys: readUniqueKeys(config, keysOf),
        foreignKeys,
      }));
    });
