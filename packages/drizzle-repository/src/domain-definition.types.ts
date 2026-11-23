import type { Table } from 'drizzle-orm';

import type { UniqueKeyDefinition } from './staging.lib';

export type Dialect = 'sqlite' | 'pg' | 'mysql';

export type ChildDefinition = {
  readonly relation: string;
  readonly table: Table;
  readonly primaryKey: string;
  // columns[i] of a child row holds parentColumns[i] of its parent row.
  readonly foreignKey: {
    readonly columns: readonly string[];
    readonly parentColumns: readonly string[];
  };
  readonly columns: readonly string[];
  readonly excludedColumns: readonly string[];
  readonly children: readonly ChildDefinition[];
};

export type DomainDefinition = {
  readonly name: string;
  readonly drizzleMajor: 0 | 1;
  readonly dialect: Dialect;
  readonly queryKey: string;
  readonly table: Table;
  readonly primaryKey: string;
  readonly columns: readonly string[];
  readonly excludedColumns: readonly string[];
  readonly lockColumn: string | undefined;
  readonly uniqueKeys: readonly UniqueKeyDefinition[];
  readonly children: readonly ChildDefinition[];
};

export type DatabaseLike = {
  readonly client: unknown;
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
};
