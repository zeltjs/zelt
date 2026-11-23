import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';
import { findStaleFiles, planFiles, writeFiles } from './generate.lib';
import type { DrizzleRepositoryOptions } from './generation.types';
import { freshSchemaLoader } from './schema-loader.lib';

// Tests run from the workspace root too, so paths are taken from this package.
const packageRoot = resolve(import.meta.dirname, '..');

const temporaryRoot = resolve(packageRoot, '.tmp');
const directories: string[] = [];

const projectDirectory = async (): Promise<string> => {
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(join(temporaryRoot, 'generation-'));
  directories.push(directory);
  return directory;
};

const schemaProject = async (tables: string): Promise<string> => {
  const directory = await projectDirectory();
  await writeFile(
    join(directory, 'schema.ts'),
    [
      `import "drizzle-metadata/register";`,
      `import "@zeltjs/drizzle-repository/metadata";`,
      `import { relations } from "drizzle-orm";`,
      `import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";`,
      tables,
    ].join('\n'),
  );
  return directory;
};

const options: DrizzleRepositoryOptions = {
  schema: './schema.ts',
  database: { from: './drizzle.service.ts', name: 'DrizzleService' },
  out: { model: './model', repository: './repository' },
};

const usersSource = [
  `import { sqliteTable, text } from "drizzle-orm/sqlite-core";`,
  `export const users = sqliteTable("users", { id: text().primaryKey() });`,
].join('\n');

const plan = (directory: string, planOptions = options) =>
  planFiles(directory, planOptions, freshSchemaLoader(directory));

const errorsOf = async (directory: string): Promise<readonly string[]> =>
  (await plan(directory))._unsafeUnwrapErr().map((error) => error.message);

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

// A link table of a many-to-many relation, keyed by both of its columns.
const manyToMany = `
  export const post = sqliteTable("post", { id: text().primaryKey() });
  export const tag = sqliteTable("tag", { id: text().primaryKey() });
  export const postTag = sqliteTable(
    "post_tag",
    { post_id: text().notNull().references(() => post.id), tag_id: text().notNull().references(() => tag.id) },
    (table) => [primaryKey({ columns: [table.post_id, table.tag_id] })],
  );`;

describe('generating', () => {
  it('reads the schema again when it changed in the same process', async () => {
    const directory = await schemaProject(
      `export const a = sqliteTable("a", { id: text().primaryKey() });`,
    );
    expect((await plan(directory))._unsafeUnwrap()).toHaveLength(2);
    const schema = join(directory, 'schema.ts');
    await writeFile(
      schema,
      `${await readFile(schema, 'utf8')}\nexport const b = sqliteTable("b", { id: text().primaryKey() });`,
    );
    expect((await plan(directory))._unsafeUnwrap()).toHaveLength(4);
  });

  it('does not rewrite a file whose content did not change', async () => {
    const directory = await schemaProject(
      `export const a = sqliteTable("a", { id: text().primaryKey() });`,
    );
    const files = (await plan(directory))._unsafeUnwrap();
    await writeFiles(files);
    const past = new Date('2000-01-01T00:00:00Z');
    for (const file of files) await utimes(file.path, past, past);
    await writeFiles(files);
    for (const file of files) expect((await stat(file.path)).mtime).toEqual(past);
  });

  it('fails when two schema files export different values under the same name', async () => {
    const directory = await schemaProject(
      `export const a = sqliteTable("a", { id: text().primaryKey() });`,
    );
    await writeFile(
      join(directory, 'other.ts'),
      `import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const a = sqliteTable("a2", { id: text().primaryKey() });`,
    );
    const result = await plan(directory, { ...options, schema: ['./schema.ts', './other.ts'] });
    expect(result._unsafeUnwrapErr().map((error) => error.message)).toEqual([
      `a: exported from both ${join(directory, 'schema.ts')} and ${join(directory, 'other.ts')}`,
    ]);
  });

  // One file exports a table; the other points a foreign key at it and re-exports it.
  const splitOptions: DrizzleRepositoryOptions = {
    ...options,
    schema: ['./users.ts', './posts.ts'],
  };
  const splitProject = async (): Promise<string> => {
    const directory = await projectDirectory();
    await writeFile(join(directory, 'users.ts'), usersSource);
    await writeFile(
      join(directory, 'posts.ts'),
      [
        `import { sqliteTable, text } from "drizzle-orm/sqlite-core";`,
        `import { users } from "./users";`,
        `export { users } from "./users";`,
        `export const posts = sqliteTable("posts", { id: text().primaryKey(), user_id: text().notNull().references(() => users.id) });`,
      ].join('\n'),
    );
    return directory;
  };
  it('reads schema files that import and re-export each other as one schema', async () => {
    const directory = await splitProject();
    const files = (await plan(directory, splitOptions))._unsafeUnwrap();
    const repository = files.find((file) => file.path.endsWith('posts.repository-base.ts'));
    expect(repository?.content).toContain('findByUserId(key: UsersExistedId)');
  });

  it('makes no domain from a table keyed by several columns', async () => {
    const directory = await schemaProject(manyToMany);
    const files = (await plan(directory))._unsafeUnwrap();
    expect(files.map((file) => file.path.slice(directory.length + 1)).sort()).toEqual([
      'model/post.model.ts',
      'model/tag.model.ts',
      'repository/post.repository-base.ts',
      'repository/tag.repository-base.ts',
    ]);
  });
});

describe('generated code', () => {
  // Table names that are also names the generated code uses, a key that needs quoting,
  // and a foreign key to a column that is not the primary key of its table.
  const awkwardSchema = `
    export const tenant = sqliteTable("tenant", { id: integer().primaryKey(), slug: text().notNull().unique() });
    export const save = sqliteTable("save", {
      id: text().primaryKey(),
      tenant_slug: text().notNull().references(() => tenant.slug),
      "first name": text().notNull().unique(),
    });
    export const domain = sqliteTable("domain", { id: text().primaryKey(), save_id: text().notNull().references(() => save.id) });
    export const drizzleService = sqliteTable("drizzle_service", { id: text().primaryKey() });
    export const dbError = sqliteTable("db_error", { id: text().primaryKey() });
    export const resultAsync = sqliteTable("result_async", { id: text().primaryKey() });
    export const saveRelations = relations(save, ({ many }) => ({ "the domains": many(domain).meta({ includedInDomain: true }) }));
    export const domainRelations = relations(domain, ({ one }) => ({ save: one(save, { fields: [domain.save_id], references: [save.id] }) }));`;

  it('type-checks whatever names the schema uses', async () => {
    const directory = await schemaProject(awkwardSchema);
    await writeFile(
      join(directory, 'drizzle.service.ts'),
      `export class DrizzleService { readonly client: unknown = {}; withTransaction<T>(fn: () => Promise<T>): Promise<T> { return fn(); } }`,
    );
    await writeFile(
      join(directory, 'usage.ts'),
      [
        `import type { Save } from "./model/save.model";`,
        `import type { SaveRepositoryBase } from "./repository/save.repository-base";`,
        `export const slug: Save["tenant_slug"] = "acme";`,
        `export type Check = SaveRepositoryBase["isExistedByFirstName"];`,
        `export type Children = Save["the domains"];`,
      ].join('\n'),
    );
    await writeFile(
      join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          verbatimModuleSyntax: true,
          skipLibCheck: true,
          noEmit: true,
          types: [],
        },
        include: ['.'],
      }),
    );
    await writeFiles((await plan(directory))._unsafeUnwrap());

    const tsc = resolve(packageRoot, 'node_modules/typescript/bin/tsc');
    // tsc prints its diagnostics to stdout, which the message of a failed execFile leaves out.
    const output = await promisify(execFile)('node', [tsc, '-p', directory]).then(
      ({ stdout, stderr }) => `${stdout}${stderr}`,
      (error: Error & { readonly stdout?: string }) => `${error.message}\n${error.stdout ?? ''}`,
    );
    expect(output).toBe('');
  }, 60_000);
});

describe('generation fails', () => {
  it('when optimisticLock is on a column that is not a number', async () => {
    const directory = await schemaProject(
      `export const a = sqliteTable("a", { id: text().primaryKey(), v: text().notNull().meta({ optimisticLock: true }) });`,
    );
    expect(await errorsOf(directory)).toEqual(['a.v: optimisticLock is only for a number column']);
  });

  it('when optimisticLock is on a column that can be NULL', async () => {
    const directory = await schemaProject(
      `export const a = sqliteTable("a", { id: text().primaryKey(), v: integer().meta({ optimisticLock: true }) });`,
    );
    expect(await errorsOf(directory)).toEqual([
      'a.v: optimisticLock is only for a NOT NULL column',
    ]);
  });

  it('when optimisticLock is on more than one column of a table', async () => {
    const directory = await schemaProject(
      `export const a = sqliteTable("a", {
        id: text().primaryKey(),
        v1: integer().notNull().meta({ optimisticLock: true }),
        v2: integer().notNull().meta({ optimisticLock: true }),
      });`,
    );
    expect(await errorsOf(directory)).toEqual(['a: optimisticLock is on more than one column']);
  });

  it('when optimisticLock is on a table that is not the root of a domain', async () => {
    const directory = await schemaProject(
      `export const parent = sqliteTable("parent", { id: text().primaryKey() });
      export const child = sqliteTable("child", {
        id: text().primaryKey(),
        parent_id: text().notNull().references(() => parent.id),
        v: integer().notNull().meta({ optimisticLock: true }),
      });
      export const parentRelations = relations(parent, ({ many }) => ({ children: many(child).meta({ includedInDomain: true }) }));
      export const childRelations = relations(child, ({ one }) => ({ parent: one(parent, { fields: [child.parent_id], references: [parent.id] }) }));`,
    );
    expect(await errorsOf(directory)).toEqual([
      'child: optimisticLock is on a table that is not the root of a domain',
    ]);
  });

  it('when includedInDomain points to a table from two tables', async () => {
    const directory = await schemaProject(
      `export const a = sqliteTable("a", { id: text().primaryKey() });
      export const b = sqliteTable("b", { id: text().primaryKey() });
      export const shared = sqliteTable("shared", {
        id: text().primaryKey(),
        a_id: text().notNull().references(() => a.id),
        b_id: text().notNull().references(() => b.id),
      });
      export const aRelations = relations(a, ({ many }) => ({ shared: many(shared).meta({ includedInDomain: true }) }));
      export const bRelations = relations(b, ({ many }) => ({ shared: many(shared).meta({ includedInDomain: true }) }));
      export const sharedRelations = relations(shared, ({ one }) => ({
        a: one(a, { fields: [shared.a_id], references: [a.id] }),
        b: one(b, { fields: [shared.b_id], references: [b.id] }),
      }));`,
    );
    expect(await errorsOf(directory)).toEqual([
      'shared: includedInDomain points to it from 2 tables',
    ]);
  });

  it('when includedInDomain puts a table keyed by several columns into a domain', async () => {
    const directory = await schemaProject(
      `${manyToMany}
      export const postRelations = relations(post, ({ many }) => ({ tags: many(postTag).meta({ includedInDomain: true }) }));
      export const postTagRelations = relations(postTag, ({ one }) => ({ post: one(post, { fields: [postTag.post_id], references: [post.id] }) }));`,
    );
    expect(await errorsOf(directory)).toEqual([
      'postTag: a table in a domain needs a single-column primary key',
    ]);
  });

  it('when includedInDomain points a table to itself', async () => {
    const directory = await schemaProject(
      `export const category = sqliteTable("category", { id: text().primaryKey(), parent_id: text() });
      export const categoryRelations = relations(category, ({ many, one }) => ({
        children: many(category, { relationName: "tree" }).meta({ includedInDomain: true }),
        parent: one(category, { fields: [category.parent_id], references: [category.id], relationName: "tree" }),
      }));`,
    );
    expect(await errorsOf(directory)).toEqual(['category: includedInDomain forms a cycle']);
  });

  it('when includedInDomain makes a cycle through several tables', async () => {
    const directory = await schemaProject(
      `export const a = sqliteTable("a", { id: text().primaryKey(), b_id: text() });
      export const b = sqliteTable("b", { id: text().primaryKey(), a_id: text() });
      export const aRelations = relations(a, ({ many, one }) => ({
        bs: many(b, { relationName: "ab" }).meta({ includedInDomain: true }),
        b: one(b, { fields: [a.b_id], references: [b.id], relationName: "ba" }),
      }));
      export const bRelations = relations(b, ({ many, one }) => ({
        as: many(a, { relationName: "ba" }).meta({ includedInDomain: true }),
        a: one(a, { fields: [b.a_id], references: [a.id], relationName: "ab" }),
      }));`,
    );
    expect(await errorsOf(directory)).toEqual(['a, b: includedInDomain forms a cycle']);
  });

  it('when the columns of an includedInDomain relation cannot be told', async () => {
    const directory = await schemaProject(
      `export const parent = sqliteTable("parent", { id: text().primaryKey() });
      export const child = sqliteTable("child", { id: text().primaryKey(), parent_id: text().notNull() });
      export const parentRelations = relations(parent, ({ many }) => ({ children: many(child).meta({ includedInDomain: true }) }));`,
    );
    expect(await errorsOf(directory)).toEqual([expect.stringMatching(/^relations: .*parent/)]);
  });

  it('when a foreign key points to a table that no schema file exports', async () => {
    const directory = await schemaProject(
      `import { users } from "./users";
      export const posts = sqliteTable("posts", { id: text().primaryKey(), user_id: text().notNull().references(() => users.id) });`,
    );
    await writeFile(join(directory, 'users.ts'), usersSource);
    expect(await errorsOf(directory)).toEqual([
      'posts.user_id: the foreign key points to users, which is not exported from the schema files',
    ]);
  });

  it('when includedInDomain points to a table that no schema file exports', async () => {
    const directory = await schemaProject(
      `import { comments } from "./comments";
      export const posts = sqliteTable("posts", { id: text().primaryKey() });
      export const postRelations = relations(posts, ({ many }) => ({ comments: many(comments).meta({ includedInDomain: true }) }));`,
    );
    await writeFile(
      join(directory, 'comments.ts'),
      `import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const comments = sqliteTable("comments", { id: text().primaryKey(), post_id: text().notNull() });`,
    );
    expect(await errorsOf(directory)).toEqual([
      'posts.comments: comments is not exported from the schema files',
    ]);
  });

  it('when a table is not of SQLite, PostgreSQL or MySQL', async () => {
    const directory = await schemaProject(
      `import { singlestoreTable, varchar } from "drizzle-orm/singlestore-core";
      export const a = singlestoreTable("a", { id: varchar({ length: 10 }).primaryKey() });`,
    );
    expect(await errorsOf(directory)).toEqual([
      'a: SingleStoreTable is not supported. Use a SQLite, PostgreSQL or MySQL table',
    ]);
  });
});

describe('checking the generated files', () => {
  const simpleSchema = `export const a = sqliteTable("a", { id: text().primaryKey(), name: text().notNull() });`;

  it('finds no stale file right after generating', async () => {
    const directory = await schemaProject(simpleSchema);
    const files = (await plan(directory))._unsafeUnwrap();
    await writeFiles(files);
    expect(await findStaleFiles(files)).toEqual([]);
  });

  it('reports files that differ from the schema', async () => {
    const directory = await schemaProject(simpleSchema);
    const files = (await plan(directory))._unsafeUnwrap();
    await writeFiles(files);
    const [edited] = files;
    if (edited === undefined) throw new Error('nothing was generated');
    await writeFile(edited.path, 'edited');
    expect(await findStaleFiles(files)).toEqual([edited.path]);
  });

  const cli = resolve(packageRoot, 'bin/zelt-drizzle-repository.mjs');
  const run = promisify(execFile);

  const writeConfig = (directory: string) =>
    writeFile(
      join(directory, 'zelt.config.ts'),
      [
        `import { drizzleRepositoryPlugin } from "@zeltjs/drizzle-repository";`,
        `export default {`,
        `  app: () => ({}),`,
        `  plugins: [drizzleRepositoryPlugin(${JSON.stringify(options)})],`,
        `};`,
      ].join('\n'),
    );

  it('the CLI with --check fails without rewriting the files', async () => {
    const directory = await schemaProject(simpleSchema);
    await writeConfig(directory);

    await expect(
      run('node', [cli, 'generate', '--config', 'zelt.config.ts', '--check'], { cwd: directory }),
    ).rejects.toThrow(/do not match the schema/);
    await run('node', [cli, 'generate', '--config', 'zelt.config.ts'], { cwd: directory });
    await run('node', [cli, 'generate', '--config', 'zelt.config.ts', '--check'], {
      cwd: directory,
    });
  }, 30_000);

  it("the CLI finds and removes the files of a table that left the schema, and keeps the user's files", async () => {
    const directory = await schemaProject(
      `${simpleSchema}\nexport const b = sqliteTable("b", { id: text().primaryKey() });`,
    );
    await writeConfig(directory);
    await run('node', [cli, 'generate', '--config', 'zelt.config.ts'], { cwd: directory });
    const ownFile = join(directory, 'model', 'own.model.ts');
    await writeFile(ownFile, 'export type Own = string;\n');
    await writeFile(
      join(directory, 'schema.ts'),
      (await readFile(join(directory, 'schema.ts'), 'utf8')).replace(/^export const b.*$/m, ''),
    );

    await expect(
      run('node', [cli, 'generate', '--config', 'zelt.config.ts', '--check'], { cwd: directory }),
    ).rejects.toThrow(/b\.repository-base\.ts/);
    await run('node', [cli, 'generate', '--config', 'zelt.config.ts'], { cwd: directory });
    expect((await readdir(join(directory, 'model'))).sort()).toEqual([
      'a.model.ts',
      'own.model.ts',
    ]);
    expect(await readdir(join(directory, 'repository'))).toEqual(['a.repository-base.ts']);
    await run('node', [cli, 'generate', '--config', 'zelt.config.ts', '--check'], {
      cwd: directory,
    });
  }, 30_000);
});
