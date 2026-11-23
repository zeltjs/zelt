import type { Table } from 'drizzle-orm';

import type { Dialect } from './domain-definition.types';

export type DrizzleRepositoryOptions = {
  readonly schema: string | readonly string[];
  readonly database: { readonly from: string; readonly name: string };
  readonly out: { readonly model: string; readonly repository: string };
};

export type GeneratedFile = { readonly path: string; readonly content: string };

export type GenerationError = { readonly message: string };

// What the generator needs from one exported table, read through drizzle's own API.
export type SchemaColumn = {
  readonly key: string;
  readonly notNull: boolean;
  readonly isNumber: boolean;
  readonly excludedFromModel: boolean;
  readonly optimisticLock: boolean;
};

export type SchemaForeignKey = {
  readonly columns: readonly string[];
  readonly table: string;
  readonly foreignColumns: readonly string[];
};

export type SchemaTable = {
  readonly exportName: string;
  readonly table: Table;
  readonly dialect: Dialect;
  readonly columns: readonly SchemaColumn[];
  readonly primaryKey: readonly string[];
  readonly uniqueKeys: readonly (readonly string[])[];
  readonly foreignKeys: readonly SchemaForeignKey[];
};

export type SchemaRelation = {
  readonly source: string;
  readonly name: string;
  readonly target: string;
  readonly many: boolean;
  readonly includedInDomain: boolean;
  // Keys of the source columns and of the target columns they match, read only for includedInDomain.
  readonly sourceColumns: readonly string[];
  readonly targetColumns: readonly string[];
};

export type Schema = {
  readonly drizzleMajor: 0 | 1;
  readonly tables: readonly SchemaTable[];
  readonly relations: readonly SchemaRelation[];
};
