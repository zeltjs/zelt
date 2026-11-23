import { is, Table } from 'drizzle-orm';
import type { Result } from 'neverthrow';
import { err, ok, ResultAsync } from 'neverthrow';

import type { GenerationError, Schema, SchemaTable } from './generation.types';
import type { DrizzleModule } from './relations-reader.lib';
import { readRelationsV0, readRelationsV1 } from './relations-reader.lib';
import type { DialectReader } from './table-reader.lib';
import { loadDialectReaders, readTable } from './table-reader.lib';

type Loaded = { readonly orm: DrizzleModule; readonly readers: readonly DialectReader[] };

const loadDrizzle = async (): Promise<Loaded> => ({
  orm: await import('drizzle-orm'),
  readers: await loadDialectReaders(),
});

const readLoaded = (
  { orm, readers }: Loaded,
  exports: Readonly<Record<string, unknown>>,
): Result<Schema, readonly GenerationError[]> => {
  const tableEntries = Object.entries(exports).flatMap(([name, value]): [string, Table][] =>
    is(value, Table) ? [[name, value]] : [],
  );
  const tableNames = new Map(tableEntries.map(([name, table]) => [table, name]));
  const tableResults = tableEntries.map(([name, table]) =>
    readTable(name, table, tableNames, readers),
  );
  const errors = tableResults.flatMap((result) => (result.isErr() ? result.error : []));
  if (errors.length > 0) return err(errors);
  const tables: SchemaTable[] = tableResults.flatMap((result) =>
    result.isOk() ? [result.value] : [],
  );
  // drizzle-orm does not export its package.json; defineRelations() exists only from 1.x.
  const drizzleMajor = Reflect.get(orm, 'defineRelations') === undefined ? 0 : 1;
  const relations =
    drizzleMajor === 0
      ? readRelationsV0(orm, exports, tableNames)
      : readRelationsV1(exports, tableNames);
  if (relations.isErr()) return err(relations.error);
  return ok({ drizzleMajor, tables, relations: relations.value });
};

export const readSchema = (
  exports: Readonly<Record<string, unknown>>,
): ResultAsync<Schema, readonly GenerationError[]> =>
  ResultAsync.fromSafePromise(loadDrizzle()).andThen((loaded) => readLoaded(loaded, exports));
