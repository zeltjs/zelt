import { getTableColumns } from 'drizzle-orm';
import { pgTable, text as pgText } from 'drizzle-orm/pg-core';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { gqlMeta } from './index';
import { readGraphqlMeta } from './metadata.lib';

describe('gqlMeta', () => {
  it('preserves table and builder identity and their inferred types', () => {
    const builder = text().notNull();
    const decorated = gqlMeta(builder, { hidden: true });
    expect(decorated).toBe(builder);
    expectTypeOf(decorated).toEqualTypeOf(builder);
    const table = sqliteTable('users', { id: text().primaryKey(), secret: decorated });
    expect(gqlMeta(table, { name: 'User' })).toBe(table);
    expectTypeOf(gqlMeta(table, { name: 'User' })).toEqualTypeOf(table);
    expect(readGraphqlMeta(table)).toEqual({ kind: 'success', value: { name: 'User' } });
    expect(readGraphqlMeta(getTableColumns(table).secret)).toEqual({
      kind: 'success',
      value: { hidden: true },
    });
  });

  it('retains column metadata after building a PostgreSQL column', () => {
    const table = pgTable('accounts', { secret: gqlMeta(pgText().notNull(), { hidden: true }) });
    expect(readGraphqlMeta(table.secret)).toEqual({ kind: 'success', value: { hidden: true } });
    expect(table.secret.notNull).toBe(true);
  });
});
