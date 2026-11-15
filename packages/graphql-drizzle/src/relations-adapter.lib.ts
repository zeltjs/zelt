import type { Column, Relation, Table, TableRelationalConfig } from 'drizzle-orm';
import {
  createTableRelationsHelpers,
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

type RelationsReader = (
  exportName: string,
  visible: (table: Table) => boolean,
) => ReadResult<readonly ReadRelation[]>;

const cardinality = (relation: Relation): Cardinality =>
  is(relation, One)
    ? { kind: 'one', nullable: !relation.config?.fields.every((column) => column.notNull) }
    : { kind: 'many' };

export const createRelationsReader = (
  schema: Record<string, unknown>,
): ReadResult<RelationsReader> => {
  const extracted = readDrizzle(() =>
    extractTablesRelationalConfig(schema, createTableRelationsHelpers),
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
