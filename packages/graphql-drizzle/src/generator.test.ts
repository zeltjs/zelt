import { relations } from 'drizzle-orm';
import { int, mysqlTable } from 'drizzle-orm/mysql-core';
import {
  bigint as pgBigint,
  integer as pgInteger,
  primaryKey as pgPrimaryKey,
  pgTable,
  text as pgText,
  serial,
} from 'drizzle-orm/pg-core';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import { gqlMeta } from './index';
import { renderModels } from './render.lib';
import { readSchema } from './schema-adapter.lib';
import * as schema from './test/fixtures/schema';

const options = {
  schemaImport: '../schema',
  databaseImport: '../database.service',
  databaseExport: 'DrizzleService',
  source: '/generated.ts',
  header: '// generated',
};

describe('schema generation', () => {
  it('emits inferred column types, generic IDs, hidden fields, and abstract batch resolvers', () => {
    const result = readSchema(schema);
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') throw new Error(result.message);
    const code = renderModels(result.models, options);
    expect(code).toContain('type UsersRow = typeof schema.users.$inferSelect;');
    expect(code).toContain('readonly id: ID<UsersRow["id"]>');
    expect(code).toContain('readonly $passwordHash: UsersRow["passwordHash"]');
    expect(code).toContain('readonly posts: readonly Post[]');
    expect(code).toContain('readonly author: User;');
    expect(code).toContain('readonly reviewer: User | null;');
    expect(code).toContain('async $drizzleRelation_posts(');
    expect(code).toContain('async $drizzleRelation_author(');
    expect(code).toContain('async $drizzleRelation_reviewer(');
    expect(code).not.toContain('$drizzleRelation0');
    expect(code).toContain('export abstract class GeneratedUserResolver');
    expect(code).toContain('readonly #database = inject(Database)');
    expect(code).not.toContain('@Resolver');
    expect(code).not.toMatch(/interface Sessions|Relation\("sessions"\)|@Query|@Mutation/);
  });

  it.each([
    ['no PK', { broken: sqliteTable('broken', { value: text() }) }],
    [
      'composite PK',
      {
        broken: sqliteTable('broken', { a: text().notNull(), b: integer().notNull() }, (t) => [
          primaryKey({ columns: [t.a, t.b] }),
        ]),
      },
    ],
    ['non-primary id', { broken: sqliteTable('broken', { key: text().primaryKey(), id: text() }) }],
    [
      'duplicate GraphQL names',
      {
        first: gqlMeta(sqliteTable('a', { id: text().primaryKey() }), { name: 'Same' }),
        second: gqlMeta(sqliteTable('b', { id: text().primaryKey() }), { name: 'Same' }),
      },
    ],
    ['unsupported MySQL', { broken: mysqlTable('broken', { id: int().primaryKey() }) }],
  ])('rejects %s', (_name, input) => {
    expect(readSchema(input).kind).toBe('error');
  });

  it('supports table-level single-column PKs and maps renamed PKs to id', () => {
    const result = readSchema({
      user_accounts: sqliteTable('accounts', { userKey: text().notNull(), first: text() }, (t) => [
        primaryKey({ columns: [t.userKey] }),
      ]),
    });
    expect(result).toMatchObject({
      kind: 'success',
      models: [
        {
          name: 'UserAccounts',
          primaryKey: 'userKey',
          columns: [
            { key: 'userKey', property: 'id' },
            { key: 'first', property: 'first' },
          ],
        },
      ],
    });
  });

  it('reads PostgreSQL and its table-level PKs', () => {
    const users = pgTable('users', { key: pgText().notNull(), name: pgText() }, (t) => [
      pgPrimaryKey({ columns: [t.key] }),
    ]);
    expect(readSchema({ users })).toMatchObject({
      kind: 'success',
      models: [{ dialect: 'pg', primaryKey: 'key' }],
    });
  });

  it.each([
    ['SQLite integer', sqliteTable('broken', { id: integer().primaryKey() })],
    ['PostgreSQL integer', pgTable('broken', { id: pgInteger().primaryKey() })],
    ['PostgreSQL serial', pgTable('broken', { id: serial().primaryKey() })],
    [
      'PostgreSQL identity',
      pgTable('broken', { id: pgInteger().primaryKey().generatedAlwaysAsIdentity() }),
    ],
    ['PostgreSQL bigint', pgTable('broken', { id: pgBigint({ mode: 'bigint' }).primaryKey() })],
  ])('rejects a non-string primary key: %s', (_name, broken) => {
    expect(readSchema({ broken })).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('must have a string primary key'),
    });
  });

  it('rejects column/relation key collisions', () => {
    const users = sqliteTable('users', { id: text().primaryKey(), posts: text() });
    const posts = sqliteTable('posts', { id: text().primaryKey(), user: text() });
    const usersRelations = relations(users, ({ many }) => ({ posts: many(posts) }));
    const postsRelations = relations(posts, ({ one }) => ({
      user: one(users, { fields: [posts.user], references: [users.id] }),
    }));
    expect(readSchema({ users, posts, usersRelations, postsRelations })).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('key clash'),
    });
  });

  it('ignores hidden tables before PK validation and relation normalization', () => {
    const hidden = gqlMeta(sqliteTable('hidden', { value: text() }), { hidden: true });
    expect(readSchema({ hidden })).toEqual({ kind: 'success', models: [] });
  });

  it('quotes property keys only when they cannot be identifiers', () => {
    const result = readSchema({
      users: sqliteTable('users', {
        id: text().primaryKey(),
        firstName: text(),
        'full-name': text(),
        名前: text(),
      }),
    });
    if (result.kind === 'error') throw new Error(result.message);
    const code = renderModels(result.models, options);
    expect(code).toContain('readonly firstName: UsersRow["firstName"];');
    expect(code).toContain('readonly "full-name": UsersRow["full-name"];');
    expect(code).toContain('readonly 名前: UsersRow["名前"];');
  });

  it('returns relation normalization errors as values', () => {
    const users = sqliteTable('users', { id: text().primaryKey() });
    const posts = sqliteTable('posts', { id: text().primaryKey() });
    const usersRelations = relations(users, ({ many }) => ({ posts: many(posts) }));
    expect(readSchema({ users, posts, usersRelations })).toEqual({
      kind: 'error',
      message: 'There is not enough information to infer relation "users.posts"',
    });
  });

  it('returns Drizzle table configuration errors as values', () => {
    const broken = sqliteTable('broken', { id: text().primaryKey() }, () => {
      throw new Error('Invalid table constraints');
    });
    expect(readSchema({ broken })).toEqual({ kind: 'error', message: 'Invalid table constraints' });
  });

  it('returns invalid table metadata as an error value', () => {
    const users = sqliteTable('users', { id: text().primaryKey() });
    Object.defineProperty(users, Symbol.for('@zeltjs/graphql-drizzle/meta'), { value: 42 });
    expect(readSchema({ users })).toEqual({
      kind: 'error',
      message: 'Invalid graphql-drizzle metadata.',
    });
  });

  it('returns invalid column metadata as an error value', () => {
    const secret = text();
    const config: unknown = Reflect.get(secret, 'config');
    if (typeof config !== 'object' || config === null)
      throw new Error('Missing Drizzle builder config');
    Object.defineProperty(config, Symbol.for('@zeltjs/graphql-drizzle/meta'), { value: null });
    const users = sqliteTable('users', { id: text().primaryKey(), secret });
    expect(readSchema({ users })).toEqual({
      kind: 'error',
      message: 'Invalid graphql-drizzle metadata.',
    });
  });

  it('returns a malformed column configuration as an error value', () => {
    const users = sqliteTable('users', { id: text().primaryKey(), secret: text() });
    Reflect.set(users.secret, 'config', null);
    expect(readSchema({ users })).toEqual({
      kind: 'error',
      message: 'gqlMeta expects a Drizzle table, column, or column builder.',
    });
  });

  it('returns Drizzle relation configuration errors as values', () => {
    const users = sqliteTable('users', { id: text().primaryKey() });
    const usersRelations = relations(users, () => {
      throw new Error('Invalid relation configuration');
    });
    expect(readSchema({ users, usersRelations })).toEqual({
      kind: 'error',
      message: 'Invalid relation configuration',
    });
  });

  it('returns a foreign join column error as a value', () => {
    const users = sqliteTable('users', { id: text().primaryKey() });
    const posts = sqliteTable('posts', { id: text().primaryKey() });
    const other = sqliteTable('other', { foreign: text() });
    const postsRelations = relations(posts, ({ one }) => ({
      // @ts-expect-error Untyped schemas can supply a join column from another table.
      author: one(users, { fields: [other.foreign], references: [users.id] }),
    }));
    expect(readSchema({ users, posts, postsRelations })).toEqual({
      kind: 'error',
      message: 'Relation column "foreign" does not belong to its table.',
    });
  });
});
