import type { Column, Relation, Table, TableRelationalConfig } from 'drizzle-orm';
import {
  createTableRelationsHelpers,
  Table as DrizzleTable,
  extractTablesRelationalConfig,
  is,
  normalizeRelation,
  One,
} from 'drizzle-orm';
import type { ReadResult } from './schema.types';
import { readDrizzle } from './schema-result.lib';

type Cardinality = { kind: 'many' } | { kind: 'one'; readonly nullable: boolean };

export type ReadRelation = {
  readonly key: string;
  readonly targetTable: Table;
  readonly fields: readonly Column[];
  readonly references: readonly Column[];
} & Cardinality;

export type SchemaTable = { readonly exportName: string; readonly table: Table };

/** The schema module as Drizzle sees it, identified once so that every reader agrees on it. */
export type DrizzleSchema = {
  /** Every exported table, hidden ones included, in export order. Aliases are not tables. */
  readonly tables: readonly SchemaTable[];
  /** The exports handed to Drizzle's relation extraction: the module without its aliases. */
  readonly entries: Readonly<Record<string, unknown>>;
};

type RelationsReader = (
  exportName: string,
  visible: (table: Table) => boolean,
) => ReadResult<readonly ReadRelation[]>;

// alias() returns a proxy that passes is(_, Table) but names no table of its own. Drizzle keeps
// this flag under a registered symbol and reads it itself in every dialect, but its typings hide it.
const isAlias = (table: Table): boolean =>
  Reflect.get(table, Symbol.for('drizzle:IsAlias')) === true;

// Drizzle indexes relations by SQL table name, so an exported alias that shares a table's name
// would take over the relations declared after it; aliases are removed before Drizzle sees them.
export const identifyDrizzleSchema = (schema: Record<string, unknown>): DrizzleSchema => {
  const tables: SchemaTable[] = [];
  const entries: [string, unknown][] = [];
  for (const [exportName, value] of Object.entries(schema)) {
    if (is(value, DrizzleTable)) {
      if (isAlias(value)) continue;
      tables.push({ exportName, table: value });
    }
    entries.push([exportName, value]);
  }
  return { tables, entries: Object.fromEntries(entries) };
};

const cardinality = (relation: Relation): Cardinality =>
  is(relation, One)
    ? { kind: 'one', nullable: !relation.config?.fields.every((column) => column.notNull) }
    : { kind: 'many' };

export const createRelationsReader = (schema: DrizzleSchema): ReadResult<RelationsReader> => {
  const extracted = readDrizzle(() =>
    extractTablesRelationalConfig(schema.entries, createTableRelationsHelpers),
  );
  if (extracted.kind === 'error') return extracted;
  const { tables, tableNamesMap } = extracted.value;
  const readRelations: RelationsReader = (exportName, visible) => {
    const config: TableRelationalConfig | undefined = tables[exportName];
    const relations: ReadRelation[] = [];
    for (const [key, relation] of Object.entries(config?.relations ?? {})) {
      if (!visible(relation.referencedTable)) continue;
      const result = readDrizzle(() => normalizeRelation(tables, tableNamesMap, relation));
      if (result.kind === 'error') return result;
      const normalized = result.value;
      relations.push({
        key,
        targetTable: relation.referencedTable,
        fields: normalized.fields,
        references: normalized.references,
        ...cardinality(relation),
      });
    }
    return { kind: 'success', value: relations };
  };
  return { kind: 'success', value: readRelations };
};
