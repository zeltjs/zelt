import { relations } from 'drizzle-orm';
import { int, mysqlTable } from 'drizzle-orm/mysql-core';
import {
  alias as pgAlias,
  bigint as pgBigint,
  integer as pgInteger,
  primaryKey as pgPrimaryKey,
  pgTable,
  text as pgText,
  serial,
} from 'drizzle-orm/pg-core';
import { alias, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import 'drizzle-metadata/register';
import './metadata';
import { generatedExports } from './generated-module.lib';
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

const importBindings = (statement: ts.ImportDeclaration): readonly string[] => {
  const bindings = statement.importClause?.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) return [bindings.name.text];
  return bindings?.elements.map((element) => element.name.text) ?? [];
};

const internalBindings = (statement: ts.Statement, file: ts.SourceFile): readonly string[] => {
  if (ts.isImportDeclaration(statement)) return importBindings(statement);
  if (ts.isTypeAliasDeclaration(statement)) return [statement.name.text];
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations.map((item) => item.name.getText(file));
  return [];
};

describe('schema generation', () => {
  it('emits inferred column types, generic IDs, hidden fields, and abstract batch resolvers', () => {
    const result = readSchema(schema);
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') throw new Error(result.message);
    const code = renderModels(result.models, options);
    expect(code).toContain('type $usersRow = typeof $schema.users.$inferSelect;');
    expect(code).toContain('readonly id: ID<$usersRow["id"]>');
    expect(code).toContain('readonly $passwordHash: $usersRow["passwordHash"]');
    expect(code).toContain('readonly posts: readonly Post[]');
    expect(code).toContain('readonly author: User;');
    expect(code).toContain('readonly reviewer: User | null;');
    expect(code).toContain('async $drizzleRelation_posts(');
    expect(code).toContain('async $drizzleRelation_author(');
    expect(code).toContain('async $drizzleRelation_reviewer(');
    expect(code).not.toContain('$drizzleRelation0');
    expect(code).toContain('export abstract class GeneratedUserResolver');
    expect(code).toContain('readonly #database = $inject($Database)');
    expect(code).not.toContain('@Resolver');
    expect(code).not.toMatch(/interface Sessions|Relation\("sessions"\)|@Query|@Mutation/);
  });

  it.each([
    [
      'no PK',
      { broken: sqliteTable('broken', { value: text() }) },
      'Table "broken" must have a single-column primary key.',
    ],
    [
      'composite PK',
      {
        broken: sqliteTable('broken', { a: text().notNull(), b: integer().notNull() }, (t) => [
          primaryKey({ columns: [t.a, t.b] }),
        ]),
      },
      'Table "broken" must have a single-column primary key.',
    ],
    [
      'nullable SQLite table-level PK',
      { broken: sqliteTable('broken', { key: text() }, (t) => [primaryKey({ columns: [t.key] })]) },
      'Table "broken" must have a non-null primary key: add .notNull() to column "key", or use the column-level .primaryKey().',
    ],
    [
      'nullable PostgreSQL table-level PK',
      {
        broken: pgTable('broken', { key: pgText() }, (t) => [pgPrimaryKey({ columns: [t.key] })]),
      },
      'Table "broken" must have a non-null primary key: add .notNull() to column "key", or use the column-level .primaryKey().',
    ],
    [
      'hidden SQLite column-level PK',
      { broken: sqliteTable('broken', { id: text().primaryKey().meta({ graphqlHidden: true }) }) },
      'Table "broken" marks primary key column "id" as hidden. Remove graphqlHidden from its .meta() because the primary key is exposed as "id".',
    ],
    [
      'hidden PostgreSQL table-level PK',
      {
        broken: pgTable(
          'broken',
          { key: pgText().notNull().meta({ graphqlHidden: true }) },
          (t) => [pgPrimaryKey({ columns: [t.key] })],
        ),
      },
      'Table "broken" marks primary key column "key" as hidden. Remove graphqlHidden from its .meta() because the primary key is exposed as "id".',
    ],
    [
      'non-primary id',
      { broken: sqliteTable('broken', { key: text().primaryKey(), id: text() }) },
      'Table "broken" has a non-primary-key column named "id".',
    ],
    [
      'unsupported MySQL',
      { broken: mysqlTable('broken', { id: int().primaryKey() }) },
      'Table "broken": only PostgreSQL and SQLite are supported.',
    ],
  ])('rejects %s', (_name, input, message) => {
    expect(readSchema(input)).toEqual({ kind: 'error', message });
  });

  it('keeps every internal binding of the generated module out of the GraphQL name space', () => {
    // GraphQL type names cannot contain `$`, so a `$` name can never be shadowed by a model.
    const database = sqliteTable('a', { id: text().primaryKey(), ref: text() }).meta({
      graphqlName: 'Database',
    });
    const relation = sqliteTable('b', { id: text().primaryKey() }).meta({
      graphqlName: 'Relation',
    });
    const databaseRelations = relations(database, ({ one }) => ({
      target: one(relation, { fields: [database.ref], references: [relation.id] }),
    }));
    const result = readSchema({ database, relation, databaseRelations });
    if (result.kind === 'error') throw new Error(result.message);
    const file = ts.createSourceFile(
      'generated.ts',
      renderModels(result.models, options),
      ts.ScriptTarget.Latest,
    );
    const internal = file.statements.flatMap((statement) => internalBindings(statement, file));
    const exported = file.statements.flatMap((statement) =>
      (ts.isInterfaceDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name
        ? [statement.name.text]
        : [],
    );
    expect(exported).toEqual([
      'Database',
      'Relation',
      'GeneratedDatabaseResolver',
      'GeneratedRelationResolver',
    ]);
    // The clash check guards exactly the names the module declares.
    expect(new Set(exported)).toEqual(
      new Set(
        result.models.flatMap((model) => generatedExports(model.name).map(({ name }) => name)),
      ),
    );
    expect(internal.filter((name) => name !== 'ID' && !name.startsWith('$'))).toEqual([]);
  });

  it.each(['ID', 'Query', 'Mutation', 'Subscription', 'String', 'Int', 'Float', 'Boolean'])(
    'rejects the reserved GraphQL type name %s',
    (name) => {
      const table = sqliteTable('a', { id: text().primaryKey() }).meta({ graphqlName: name });
      expect(readSchema({ table })).toEqual({
        kind: 'error',
        message: `Table "table" uses the GraphQL type name "${name}", which GraphQL reserves. Set a different name with .meta({ graphqlName: ... }) on the table in the schema.`,
      });
    },
  );

  it.each([
    [
      'two models',
      { first: 'Same', second: 'Same' },
      'Duplicate GraphQL type name "Same": it is both the GraphQL type name of table "first" and the GraphQL type name of table "second". Set a different name with .meta({ graphqlName: ... }) on the table in the schema.',
    ],
    [
      'a model and a later resolver',
      { first: 'GeneratedPostResolver', second: 'Post' },
      'Duplicate export name in the generated module "GeneratedPostResolver": it is both the GraphQL type name of table "first" and the resolver class generated for table "second". Set a different name with .meta({ graphqlName: ... }) on the table in the schema.',
    ],
    [
      'a resolver and a later model',
      { first: 'Post', second: 'GeneratedPostResolver' },
      'Duplicate export name in the generated module "GeneratedPostResolver": it is both the resolver class generated for table "first" and the GraphQL type name of table "second". Set a different name with .meta({ graphqlName: ... }) on the table in the schema.',
    ],
  ])('rejects generated export names shared by %s', (_case, names, message) => {
    const input = Object.fromEntries(
      Object.entries(names).map(([key, name]) => [
        key,
        sqliteTable(key, { id: text().primaryKey() }).meta({ graphqlName: name }),
      ]),
    );
    expect(readSchema(input)).toEqual({ kind: 'error', message });
  });

  it.each(['string', 'class', 'undefined', 'keyof'])(
    'rejects the type name %s, which TypeScript cannot use as the model interface',
    (name) => {
      const table = sqliteTable('a', { id: text().primaryKey() }).meta({ graphqlName: name });
      expect(readSchema({ table })).toEqual({
        kind: 'error',
        message: `Table "table" uses the GraphQL type name "${name}", which TypeScript reserves and the generated model interface cannot take. Set a different name with .meta({ graphqlName: ... }) on the table in the schema.`,
      });
    },
  );

  it.each(['__User', 'User-Name', '名前', '1User'])(
    'rejects the GraphQL type name %s, which is not a GraphQL name',
    (name) => {
      const table = sqliteTable('a', { id: text().primaryKey() }).meta({ graphqlName: name });
      expect(readSchema({ table })).toEqual({
        kind: 'error',
        message: `Table "table" has an invalid GraphQL type name "${name}" (letters, digits and "_", not starting with a digit or "__"). Set a different name with .meta({ graphqlName: ... }) on the table in the schema.`,
      });
    },
  );

  it.each([
    ['user_posts', 'type $user_postsRow = typeof $schema.user_posts.$inferSelect;'],
    ['userPosts', 'type $userPostsRow = typeof $schema.userPosts.$inferSelect;'],
    ['$posts', 'type $$24$postsRow = typeof $schema.$posts.$inferSelect;'],
    ['my-posts', 'type $my$2d$postsRow = (typeof $schema)["my-posts"]["$inferSelect"];'],
  ])('derives a distinct internal row type from the export name %s', (exportName, alias) => {
    const result = readSchema({
      [exportName]: sqliteTable('a', { id: text().primaryKey() }).meta({ graphqlName: 'A' }),
      userposts: sqliteTable('b', { id: text().primaryKey() }).meta({ graphqlName: 'B' }),
    });
    if (result.kind === 'error') throw new Error(result.message);
    const code = renderModels(result.models, options);
    expect(code).toContain(alias);
    expect(code).toContain('type $userpostsRow = typeof $schema.userposts.$inferSelect;');
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
    const hidden = sqliteTable('hidden', { value: text() }).meta({ graphqlHidden: true });
    expect(readSchema({ hidden })).toEqual({ kind: 'success', models: [] });
  });

  describe('exported aliases', () => {
    const render = (exports: Record<string, unknown>): string => {
      const result = readSchema(exports);
      if (result.kind !== 'success') throw new Error(result.message);
      return renderModels(result.models, options);
    };
    const pgUsers = pgTable('users', { id: pgText().primaryKey(), parentId: pgText() });
    const sqliteUsers = sqliteTable('users', { id: text().primaryKey(), parentId: text() });

    it.each([
      ['PostgreSQL', pgUsers, pgAlias(pgUsers, 'parent')],
      ['SQLite', sqliteUsers, alias(sqliteUsers, 'parent')],
    ])('ignores a %s alias like any other non-table export', (_dialect, users, parent) => {
      expect(readSchema({ users, parent })).toMatchObject({
        kind: 'success',
        models: [{ name: 'Users' }],
      });
      expect(render({ users, parent })).toBe(render({ users }));
    });

    it('keeps a self-relation when an alias of the table is exported', () => {
      const users = sqliteUsers;
      const usersRelations = relations(users, ({ one, many }) => ({
        parent: one(users, {
          fields: [users.parentId],
          references: [users.id],
          relationName: 'parent',
        }),
        children: many(users, { relationName: 'parent' }),
      }));
      const parent = alias(users, 'parent');
      expect(readSchema({ users, parent, usersRelations })).toMatchObject({
        kind: 'success',
        models: [
          {
            name: 'Users',
            relations: [
              { key: 'parent', target: 'Users', kind: 'one' },
              { key: 'children', target: 'Users', kind: 'many' },
            ],
          },
        ],
      });
      expect(render({ users, parent, usersRelations })).toBe(render({ users, usersRelations }));
    });

    // Drizzle indexes relations by SQL name; an alias sharing it must not take them over.
    const pgSchema = () => {
      const users = pgTable('users', { id: pgText().primaryKey() });
      const posts = pgTable('posts', { id: pgText().primaryKey(), authorId: pgText().notNull() });
      return {
        sameName: pgAlias(users, 'users'),
        exports: {
          users,
          posts,
          usersRelations: relations(users, ({ many }) => ({ posts: many(posts) })),
          postsRelations: relations(posts, ({ one }) => ({
            author: one(users, { fields: [posts.authorId], references: [users.id] }),
          })),
        },
      };
    };
    const sqliteSchema = () => {
      const users = sqliteTable('users', { id: text().primaryKey() });
      const posts = sqliteTable('posts', { id: text().primaryKey(), authorId: text().notNull() });
      return {
        sameName: alias(users, 'users'),
        exports: {
          users,
          posts,
          usersRelations: relations(users, ({ many }) => ({ posts: many(posts) })),
          postsRelations: relations(posts, ({ one }) => ({
            author: one(users, { fields: [posts.authorId], references: [users.id] }),
          })),
        },
      };
    };

    it.each([
      ['PostgreSQL', pgSchema()],
      ['SQLite', sqliteSchema()],
    ])(
      'leaves the output unchanged when a %s alias takes the SQL name of a real table',
      (_dialect, { sameName, exports }) => {
        const { users, posts, usersRelations, postsRelations } = exports;
        const expected = render(exports);
        expect(expected).toContain('async $drizzleRelation_posts(');
        expect(expected).toContain('async $drizzleRelation_author(');
        for (const placed of [
          { sameName, ...exports },
          { users, sameName, posts, usersRelations, postsRelations },
          { ...exports, sameName },
        ])
          expect(render(placed)).toBe(expected);
      },
    );
  });

  it('does not expose a relation to a hidden table', () => {
    const users = sqliteTable('users', { id: text().primaryKey() });
    const sessions = sqliteTable('sessions', {
      id: text().primaryKey(),
      userId: text().notNull(),
    }).meta({ graphqlHidden: true });
    const usersRelations = relations(users, ({ many }) => ({ sessions: many(sessions) }));
    const sessionsRelations = relations(sessions, ({ one }) => ({
      user: one(users, { fields: [sessions.userId], references: [users.id] }),
    }));
    expect(readSchema({ users, sessions, usersRelations, sessionsRelations })).toMatchObject({
      kind: 'success',
      models: [{ name: 'Users', relations: [] }],
    });
  });

  it.each(['full-name', '名前', '__internal', '$secret', '1st'])(
    'rejects the public column key %s, which is not a GraphQL name',
    (key) => {
      const users = sqliteTable('users', { id: text().primaryKey(), [key]: text() });
      expect(readSchema({ users })).toEqual({
        kind: 'error',
        message: `Table "users" exposes the column key "${key}", which is not a valid GraphQL field name (letters, digits and "_", not starting with a digit or "__"). Rename the key in the table definition, or hide the column with .meta({ graphqlHidden: true }).`,
      });
    },
  );

  it('rejects a relation key that is not a GraphQL name', () => {
    const users = sqliteTable('users', { id: text().primaryKey() });
    const posts = sqliteTable('posts', { id: text().primaryKey(), user: text() });
    const postsRelations = relations(posts, ({ one }) => ({
      'written-by': one(users, { fields: [posts.user], references: [users.id] }),
    }));
    expect(readSchema({ users, posts, postsRelations })).toEqual({
      kind: 'error',
      message:
        'Table "posts" has the relation key "written-by", which is not a valid GraphQL field name (letters, digits and "_", not starting with a digit or "__"). Rename the key in relations().',
    });
  });

  it('accepts any key for a hidden column, quoting it when it is not an identifier', () => {
    const result = readSchema({
      users: sqliteTable('users', {
        id: text().primaryKey(),
        firstName: text(),
        'full-name': text().meta({ graphqlHidden: true }),
        名前: text().meta({ graphqlHidden: true }),
        secret: text().meta({ graphqlHidden: true }),
      }),
    });
    if (result.kind === 'error') throw new Error(result.message);
    const code = renderModels(result.models, options);
    expect(code).toContain('readonly firstName: $usersRow["firstName"];');
    expect(code).toContain('readonly "$full-name": $usersRow["full-name"];');
    expect(code).toContain('readonly $名前: $usersRow["名前"];');
    expect(code).toContain('readonly $secret: $usersRow["secret"];');
  });

  it('cannot expose a public column that collides with a hidden column', () => {
    const users = sqliteTable('users', {
      id: text().primaryKey(),
      secret: text().meta({ graphqlHidden: true }),
      $secret: text(),
    });
    expect(readSchema({ users })).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('exposes the column key "$secret"'),
    });
  });

  describe('relation join columns', () => {
    const users = sqliteTable('users', { id: text().primaryKey() });
    const posts = sqliteTable('posts', { id: text().primaryKey(), authorId: text() });
    // Same SQL table names, so Drizzle's types accept their columns; they are other tables.
    const otherUsers = sqliteTable('users', { id: text().primaryKey() });
    const otherPosts = sqliteTable('posts', { id: text().primaryKey(), authorId: text() });

    it.each([
      ['fields', otherPosts.authorId, users.id],
      ['references', posts.authorId, otherUsers.id],
    ])('rejects a same-named column of another table in %s', (_side, field, reference) => {
      const postsRelations = relations(posts, ({ one }) => ({
        author: one(users, { fields: [field], references: [reference] }),
      }));
      expect(readSchema({ users, posts, postsRelations })).toMatchObject({
        kind: 'error',
        message: expect.stringMatching(/^Relation "author" /),
      });
    });

    it('accepts PostgreSQL columns that also appear in table-level constraints', () => {
      const pgUsers = pgTable('users', { key: pgText().notNull() }, (t) => [
        pgPrimaryKey({ columns: [t.key] }),
      ]);
      const pgPosts = pgTable('posts', { id: pgText().primaryKey(), authorKey: pgText() });
      const pgPostsRelations = relations(pgPosts, ({ one }) => ({
        author: one(pgUsers, { fields: [pgPosts.authorKey], references: [pgUsers.key] }),
      }));
      expect(
        readSchema({ users: pgUsers, posts: pgPosts, postsRelations: pgPostsRelations }),
      ).toMatchObject({
        kind: 'success',
        models: [
          { primaryKey: 'key' },
          { relations: [{ joins: [{ source: 'authorKey', target: 'key' }] }] },
        ],
      });
    });
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

  // Schemas are loaded without type checking, so metadata of the wrong type reaches the reader.
  it('returns invalid table metadata as an error value', () => {
    const users = sqliteTable('users', { id: text().primaryKey() });
    Reflect.apply(users.meta, users, [{ graphqlName: 42 }]);
    expect(readSchema({ users })).toEqual({
      kind: 'error',
      message: 'Invalid graphql-drizzle metadata: "graphqlName" must be a string.',
    });
  });

  it('returns invalid column metadata as an error value', () => {
    const secret = text();
    Reflect.apply(secret.meta, secret, [{ graphqlHidden: 'yes' }]);
    const users = sqliteTable('users', { id: text().primaryKey(), secret });
    expect(readSchema({ users })).toEqual({
      kind: 'error',
      message: 'Invalid graphql-drizzle metadata: "graphqlHidden" must be a boolean.',
    });
  });

  it('returns a malformed column configuration as an error value', () => {
    const users = sqliteTable('users', { id: text().primaryKey(), secret: text() });
    Reflect.set(users.secret, 'config', null);
    expect(readSchema({ users })).toMatchObject({ kind: 'error' });
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
      message:
        'Relation "author" joins on a column "foreign" that does not belong to table "posts".',
    });
  });
});
