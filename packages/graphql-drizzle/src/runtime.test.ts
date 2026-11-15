import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { createApp } from '@zeltjs/core';
import { Resolver } from '@zeltjs/graphql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderModels } from './render.lib';
import { readSchema } from './schema-adapter.lib';
import * as advancedSchema from './test/fixtures/advanced-schema';
import { DrizzleService, queries } from './test/fixtures/database.service';
import * as schema from './test/fixtures/schema';

type UserValues = { id: string; firstName: string; lastName: string; $passwordHash: string };
type PostValues = {
  id: string;
  title: string;
  authorId: string;
  reviewerId: string | null;
  $createdAt: Date;
};
type Ref<T> = { readonly id: T };
type Batch<T, Value> = (refs: readonly Ref<T>[]) => Promise<ReadonlyMap<T, Value>>;
type UserMethods = {
  $drizzleValues: Batch<string, UserValues>;
  $drizzleRelation_posts: Batch<string, readonly Ref<string>[]>;
};
type PostMethods = {
  $drizzleValues: Batch<string, PostValues>;
  $drizzleRelation_author: Batch<string, Ref<string>>;
  $drizzleRelation_reviewer: Batch<string, Ref<string> | null>;
};

type EmployeeMethods = {
  $drizzleValues: Batch<
    string,
    { id: string; code: string; tenant: string; managerCode: string | null }
  >;
  $drizzleRelation_manager: Batch<string, Ref<string> | null>;
  $drizzleRelation_reports: Batch<string, readonly Ref<string>[]>;
};
let employees: EmployeeMethods;
let directory: string;
let targets: {
  users: UserMethods;
  posts: PostMethods;
  db: DrizzleService;
  shutdown: () => Promise<void>;
};

beforeAll(async () => {
  const root = resolve(__dirname, '../../..');
  await mkdir(resolve(root, '.tmp'), { recursive: true });
  directory = await mkdtemp(resolve(root, '.tmp/graphql-drizzle-runtime-'));
  const result = readSchema(schema);
  if (result.kind !== 'success') throw new Error(result.message);
  const code = renderModels(result.models, {
    schemaImport: relative(directory, resolve(__dirname, 'test/fixtures/schema')).replaceAll(
      '\\',
      '/',
    ),
    databaseImport: relative(
      directory,
      resolve(__dirname, 'test/fixtures/database.service'),
    ).replaceAll('\\', '/'),
    databaseExport: 'DrizzleService',
    source: resolve(directory, 'generated.ts'),
    header: '// generated',
  });
  const file = resolve(directory, 'generated.ts');
  await writeFile(file, code);
  const generated = (await import(/* @vite-ignore */ file)) as {
    GeneratedUserResolver: new () => UserMethods;
    GeneratedPostResolver: new () => PostMethods;
  };
  @Resolver()
  class UserResolver extends generated.GeneratedUserResolver {}
  @Resolver()
  class PostResolver extends generated.GeneratedPostResolver {}
  const userTarget = await createApp([]).createRuntime();
  targets = {
    users: await userTarget.get(UserResolver),
    posts: await userTarget.get(PostResolver),
    db: await userTarget.get(DrizzleService),
    shutdown: () => userTarget.shutdown(),
  };
  const advanced = readSchema(advancedSchema);
  if (advanced.kind !== 'success') throw new Error(advanced.message);
  const advancedFile = resolve(directory, 'advanced.ts');
  await writeFile(
    advancedFile,
    renderModels(advanced.models, {
      schemaImport: relative(directory, resolve(__dirname, 'test/fixtures/advanced-schema')),
      databaseImport: relative(directory, resolve(__dirname, 'test/fixtures/database.service')),
      databaseExport: 'DrizzleService',
      source: advancedFile,
      header: '// generated',
    }),
  );
  const advancedModule = (await import(/* @vite-ignore */ advancedFile)) as {
    GeneratedEmployeeResolver: new () => EmployeeMethods;
  };
  @Resolver()
  class EmployeeResolver extends advancedModule.GeneratedEmployeeResolver {}
  employees = await userTarget.get(EmployeeResolver);
  targets.db.client.run(
    'CREATE TABLE employees (employee_id TEXT PRIMARY KEY, code TEXT NOT NULL, tenant TEXT NOT NULL, manager_code TEXT)',
  );
  targets.db.client.run(
    "INSERT INTO employees VALUES ('e10', 'boss', 'a', NULL), ('e02', 'worker', 'a', 'boss'), ('e01', 'boss', 'b', NULL), ('e07', 'second', 'a', 'boss')",
  );
});
afterAll(async () => {
  await targets.shutdown();
  if (directory) await rm(directory, { recursive: true, force: true });
});
beforeEach(() => {
  queries.length = 0;
});

describe('generated batches with a real SQLite database', () => {
  it('fetches public and hidden columns for all ids in one query', async () => {
    const values = await targets.users.$drizzleValues([{ id: 'u2' }, { id: 'u1' }]);
    expect(values.get('u1')).toEqual({
      id: 'u1',
      firstName: '太郎',
      lastName: '山田',
      $passwordHash: 'secret',
    });
    expect([...values.keys()]).toEqual(['u2', 'u1']);
    expect(queries).toHaveLength(1);
  });
  it('throws when any requested id is missing', async () => {
    await expect(targets.users.$drizzleValues([{ id: 'u1' }, { id: 'absent' }])).rejects.toThrow(
      'User absent not found',
    );
    expect(queries).toHaveLength(1);
  });
  it('groups many by parent with ascending target PK and an empty list when absent', async () => {
    const values = await targets.users.$drizzleRelation_posts([
      { id: 'u2' },
      { id: 'u1' },
      { id: 'u3' },
    ]);
    expect([...values]).toEqual([
      ['u2', [{ id: 'p008' }]],
      ['u1', [{ id: 'p003' }, { id: 'p020' }]],
      ['u3', []],
    ]);
    expect(queries).toHaveLength(1);
  });
  it('loads required one references in one query and rejects a dangling reference', async () => {
    expect([
      ...(await targets.posts.$drizzleRelation_author([{ id: 'p020' }, { id: 'p008' }])),
    ]).toEqual([
      ['p020', { id: 'u1' }],
      ['p008', { id: 'u2' }],
    ]);
    expect(queries).toHaveLength(1);
    await expect(targets.posts.$drizzleRelation_author([{ id: 'p099' }])).rejects.toThrow(
      'Post.author: missing target for p099',
    );
  });
  it('loads nullable one references in one query, including null', async () => {
    expect([
      ...(await targets.posts.$drizzleRelation_reviewer([{ id: 'p020' }, { id: 'p003' }])),
    ]).toEqual([
      ['p020', { id: 'u2' }],
      ['p003', null],
    ]);
    expect(queries).toHaveLength(1);
  });
  it('preserves hidden Date values for custom conversion', async () => {
    const values = await targets.posts.$drizzleValues([{ id: 'p003' }]);
    expect(values.get('p003')?.$createdAt).toEqual(new Date(1700000000000));
    expect(queries).toHaveLength(1);
  });
  it('does no database work for empty batches', async () => {
    expect(await targets.users.$drizzleValues([])).toEqual(new Map());
    expect(await targets.users.$drizzleRelation_posts([])).toEqual(new Map());
    expect(await targets.posts.$drizzleRelation_author([])).toEqual(new Map());
    expect(queries).toHaveLength(0);
  });
  it('resolves self relations through composite joins to non-PK columns and renamed PKs', async () => {
    expect((await employees.$drizzleValues([{ id: 'e02' }])).get('e02')).toEqual({
      id: 'e02',
      code: 'worker',
      tenant: 'a',
      managerCode: 'boss',
    });
    queries.length = 0;
    expect([...(await employees.$drizzleRelation_manager([{ id: 'e02' }, { id: 'e10' }]))]).toEqual(
      [
        ['e02', { id: 'e10' }],
        ['e10', null],
      ],
    );
    expect(queries).toHaveLength(1);
    queries.length = 0;
    expect([...(await employees.$drizzleRelation_reports([{ id: 'e10' }, { id: 'e01' }]))]).toEqual(
      [
        ['e10', [{ id: 'e02' }, { id: 'e07' }]],
        ['e01', []],
      ],
    );
    expect(queries).toHaveLength(1);
  });
  it('obtains the current client through DatabaseService during a propagated transaction', async () => {
    await expect(
      targets.db.withTransaction(async () => {
        targets.db.client.run("UPDATE users SET first_name = 'Transaction' WHERE id = 'u1'");
        expect((await targets.users.$drizzleValues([{ id: 'u1' }])).get('u1')?.firstName).toBe(
          'Transaction',
        );
        expect(queries.some((sql) => sql.startsWith('tx: select'))).toBe(true);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await targets.users.$drizzleValues([{ id: 'u1' }])).get('u1')?.firstName).toBe('太郎');
  });
});
