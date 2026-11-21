import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { createApp } from '@zeltjs/core';
import type { GraphqlResolverClass } from '@zeltjs/graphql';
import { createGraphqlExecutor } from '@zeltjs/graphql';
import { generateGraphqlRuntimeForResolvers } from '@zeltjs/graphql/codegen';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderModels } from './render.lib';
import { readSchema } from './schema-adapter.lib';
import { queries } from './test/fixtures/database.service';
import * as schema from './test/fixtures/schema';

let directory: string;
let tsconfig: string;
let resolvers: readonly [GraphqlResolverClass, GraphqlResolverClass];
let createDuplicateResolver: () => GraphqlResolverClass;

// These contracts require the parallel core change: inherited method decorators,
// ID<T> and primitive brand intersections. Additional fields use declaration merging.
beforeAll(async () => {
  const root = resolve(__dirname, '../../..');
  await mkdir(resolve(root, '.tmp'), { recursive: true });
  directory = await mkdtemp(resolve(root, '.tmp/graphql-drizzle-core-'));
  const result = readSchema(schema);
  if (result.kind !== 'success') throw new Error(result.message);
  await writeFile(
    resolve(directory, 'generated.ts'),
    renderModels(result.models, {
      schemaImport: relative(directory, resolve(__dirname, 'test/fixtures/schema')),
      databaseImport: relative(directory, resolve(__dirname, 'test/fixtures/database.service')),
      databaseExport: 'DrizzleService',
      source: resolve(directory, 'generated.ts'),
      header: '// generated',
    }),
  );
  const resolversFile = resolve(directory, 'resolvers.ts');
  await writeFile(
    resolversFile,
    `
import { inject } from '@zeltjs/core';
import { Query, ResolveField, Resolver } from '@zeltjs/graphql';
import { asc } from 'drizzle-orm';
import * as v from 'valibot';
import { DrizzleService } from '${relative(directory, resolve(__dirname, 'test/fixtures/database.service'))}';
import { users } from '${relative(directory, resolve(__dirname, 'test/fixtures/schema'))}';
import { GeneratedUserResolver, GeneratedPostResolver, type User, type Post } from './generated';

declare module './generated' {
  interface User {
    readonly displayName: string;
    readonly hasPassword: boolean;
  }
  interface Post {
    readonly createdAt: string;
  }
}

@Resolver()
export class UserResolver extends GeneratedUserResolver {
  readonly #db = inject(DrizzleService);
  @Query()
  async users(): Promise<readonly Pick<User, 'id'>[]> { return this.#db.client.select({ id: users.id }).from(users).orderBy(asc(users.id)); }
  @Query()
  missing(): Pick<User, 'id'> { return { id: v.parse(v.pipe(v.string(), v.brand('UserId')), 'missing') }; }
  @ResolveField()
  displayName(user: Pick<User, 'firstName' | 'lastName'>): string { return user.firstName + ' ' + user.lastName; }
  @ResolveField()
  hasPassword(user: Pick<User, '$passwordHash'>): boolean { return user.$passwordHash.length > 0; }
}
@Resolver()
export class PostResolver extends GeneratedPostResolver {
  @ResolveField()
  createdAt(post: Pick<Post, '$createdAt'>): string { return post.$createdAt.toISOString(); }
}
export function createDuplicateResolver() {
@Resolver()
class DuplicateResolver extends UserResolver {
  @ResolveField()
  firstName(user: Pick<User, 'lastName'>): string { return user.lastName; }
}
return DuplicateResolver;
}
`,
  );
  tsconfig = resolve(directory, 'tsconfig.json');
  await writeFile(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        baseUrl: root,
        ignoreDeprecations: '6.0',
        paths: {
          '@zeltjs/graphql': ['packages/graphql/src/index.ts'],
          '@zeltjs/core': ['packages/core/dist/index.d.ts'],
          'drizzle-orm': ['packages/graphql-drizzle/node_modules/drizzle-orm'],
          'drizzle-orm/*': ['packages/graphql-drizzle/node_modules/drizzle-orm/*'],
          'drizzle-metadata': [
            'packages/graphql-drizzle/node_modules/drizzle-metadata/dist/index.d.ts',
          ],
          'drizzle-metadata/register': [
            'packages/graphql-drizzle/node_modules/drizzle-metadata/dist/register.d.ts',
          ],
          valibot: ['packages/graphql-drizzle/node_modules/valibot'],
        },
      },
      include: [resolve(directory, '*.ts')],
    }),
  );
  const module = (await import(/* @vite-ignore */ resolversFile)) as {
    UserResolver: GraphqlResolverClass;
    PostResolver: GraphqlResolverClass;
    createDuplicateResolver: () => GraphqlResolverClass;
  };
  resolvers = [module.UserResolver, module.PostResolver];
  createDuplicateResolver = module.createDuplicateResolver;
});
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('core integration (requires the parallel GraphQL core change)', () => {
  it('builds SDL and executes nested batches with inherited fields, brands, string IDs, and custom hidden conversions', async () => {
    const runtime = await generateGraphqlRuntimeForResolvers(resolvers, { tsconfig });
    expect(runtime.schemaSdl).toContain('id: ID!');
    expect(runtime.schemaSdl).toContain('displayName: String!');
    expect(runtime.schemaSdl).toContain('hasPassword: Boolean!');
    expect(runtime.schemaSdl).toContain('authorId: String!');
    expect(runtime.schemaSdl).toContain('reviewer: User');
    expect(runtime.schemaSdl).not.toMatch(/passwordHash|Sessions|\$createdAt/);
    const running = await createApp([]).createRuntime();
    try {
      const executor = createGraphqlExecutor({
        runtime,
        resolvers,
        resolveResolver: (resolver) => running.get(resolver),
      });
      queries.length = 0;
      const response = await executor({
        query:
          '{ users { id displayName hasPassword posts { id title createdAt author { id firstName } reviewer { id } } } }',
      });
      expect(response.errors).toBeUndefined();
      expect(response.data).toEqual({
        users: [
          {
            id: 'u1',
            displayName: '太郎 山田',
            hasPassword: true,
            posts: [
              {
                id: 'p003',
                title: 'First',
                createdAt: '2023-11-14T22:13:20.000Z',
                author: { id: 'u1', firstName: '太郎' },
                reviewer: null,
              },
              {
                id: 'p020',
                title: 'Second',
                createdAt: '2023-11-14T22:13:20.000Z',
                author: { id: 'u1', firstName: '太郎' },
                reviewer: { id: 'u2' },
              },
            ],
          },
          {
            id: 'u2',
            displayName: '花子 佐藤',
            hasPassword: false,
            posts: [
              {
                id: 'p008',
                title: 'Other',
                createdAt: '2023-11-14T22:13:20.000Z',
                author: { id: 'u2', firstName: '花子' },
                reviewer: null,
              },
            ],
          },
          { id: 'u3', displayName: 'Empty User', hasPassword: false, posts: [] },
        ],
      });
      expect(queries).toHaveLength(6);
      queries.length = 0;
      await executor({ query: '{ users { firstName } }' });
      expect(queries).toHaveLength(2);
    } finally {
      await running.shutdown();
    }
  });

  it('turns a nonexistent Query ID into a GraphQL error', async () => {
    const runtime = await generateGraphqlRuntimeForResolvers(resolvers, { tsconfig });
    const running = await createApp([]).createRuntime();
    try {
      const execute = createGraphqlExecutor({
        runtime,
        resolvers,
        resolveResolver: (resolver) => running.get(resolver),
      });
      const response = await execute({ query: '{ missing { firstName } }' });
      expect(response.errors?.[0]?.message).toContain('User missing not found');
      expect(response.data).toBeNull();
    } finally {
      await running.shutdown();
    }
  });

  it('typechecks the generated model, brands, and queries against the ID<T> contract', () => {
    const config = ts.readConfigFile(tsconfig, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, directory);
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    expect(diagnostics).toEqual([]);
  });

  it('rejects ResolveField supplying a public generated column a second time', async () => {
    await expect(
      generateGraphqlRuntimeForResolvers([createDuplicateResolver(), resolvers[1]], { tsconfig }),
    ).rejects.toThrow(
      /firstName.*(duplicate|multiple|suppl)|(?:duplicate|multiple|suppl).*firstName/i,
    );
  });
});
