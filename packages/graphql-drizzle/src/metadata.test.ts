import 'drizzle-metadata/register';
import './metadata';
import { getTableColumns } from 'drizzle-orm';
import { pgTable, text as pgText } from 'drizzle-orm/pg-core';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import { readColumnGraphqlMeta, readTableGraphqlMeta } from './metadata.lib';

describe('GraphQL metadata', () => {
  it('reads table and column metadata written with .meta()', () => {
    const table = sqliteTable('users', {
      id: text().primaryKey(),
      secret: text().notNull().meta({ graphqlHidden: true }),
    }).meta({ graphqlName: 'User' });
    expect(readTableGraphqlMeta(table)).toEqual({
      kind: 'success',
      value: { name: 'User', hidden: false },
    });
    expect(readColumnGraphqlMeta(getTableColumns(table).secret)).toEqual({
      kind: 'success',
      value: { hidden: true },
    });
    expect(readColumnGraphqlMeta(getTableColumns(table).id)).toEqual({
      kind: 'success',
      value: { hidden: false },
    });
  });

  it('retains column metadata after building a PostgreSQL column', () => {
    const table = pgTable('accounts', { secret: pgText().notNull().meta({ graphqlHidden: true }) });
    expect(readColumnGraphqlMeta(table.secret)).toEqual({
      kind: 'success',
      value: { hidden: true },
    });
    expect(table.secret.notNull).toBe(true);
  });

  it('ignores metadata keys owned by other plugins', () => {
    const table = sqliteTable('users', { id: text().primaryKey() });
    Reflect.apply(table.meta, table, [{ otherPluginKey: true }]);
    expect(readTableGraphqlMeta(table)).toEqual({ kind: 'success', value: { hidden: false } });
  });
});
