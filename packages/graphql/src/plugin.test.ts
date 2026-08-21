import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';
import { readGraphqlCodegenManifest } from './graphql-codegen-manifest.lib';
import { generateGraphqlSdl, graphqlPlugin } from './graphql-plugin.lib';
import type { GqlOutput } from './index';
import { computeGraphqlPrebuiltHash, gqlScalar, graphql, Mutation, Query, Resolver } from './index';
import { generateSchemaFirstCodegen } from './schema-first-codegen.lib';

type ViewerPublic = {
  readonly id: string;
};

@Resolver()
class ViewerResolver {
  @Query()
  viewer(): ViewerPublic {
    return { id: 'viewer' };
  }
}

export const PluginMoneyScalar = gqlScalar<{ readonly cents: number }>('Money', {
  serialize: (value) => value.cents,
});

type PluginPricePublic = {
  readonly amount: GqlOutput<typeof PluginMoneyScalar>;
};

@Resolver()
class PluginScalarResolver {
  @Query()
  pluginPrice(): PluginPricePublic {
    return { amount: { cents: 500 } };
  }
}

const importFresh = async (path: string): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ `${pathToFileURL(path).href}?t=${Date.now()}-${Math.random()}`);

describe('generateGraphqlSdl', () => {
  it('writes the runtime and SDL under <cwd>/.zelt/graphql/, keyed by the default `graphql` name', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-'));
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver] });

    const result = await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    expect(result.changed).toBe(true);
    const runtimeFile = resolve(cwd, `.zelt/graphql/graphql.runtime.ts`);
    const sdlFile = resolve(cwd, `.zelt/graphql/graphql.runtime.graphql`);
    await expect(readFile(sdlFile, 'utf8')).resolves.toContain(`type Query {
  viewer: ViewerPublic!
}`);
    await expect(readFile(runtimeFile, 'utf8')).resolves.toContain('export const graphqlPrebuilt');
  });

  it('uses a hyphenated `name` as the filename verbatim', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-hyphen-'));
    const child = graphql({ path: '/api/v1/graphql', resolvers: [ViewerResolver], name: 'api-v1' });

    await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    await expect(
      readFile(resolve(cwd, `.zelt/graphql/api-v1.runtime.ts`), 'utf8'),
    ).resolves.toContain('export const graphqlPrebuilt');
  });

  it('returns a PrebuiltContribution pointing at the generated module', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-contribution-'));
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver] });

    const result = await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    expect(result.contributions).toEqual([
      {
        feature: 'graphql',
        key: 'graphql',
        importPath: `./graphql/graphql.runtime`,
        exportName: 'graphqlPrebuilt',
      },
    ]);
  });

  it('lets two endpoints coexist when each is given a distinct `name`', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-distinct-name-'));
    const viewerChild = graphql({ path: '/graphql', resolvers: [ViewerResolver], name: 'viewer' });
    const scalarChild = graphql({
      path: '/graphql',
      resolvers: [PluginScalarResolver],
      name: 'scalar',
    });

    const result = await generateGraphqlSdl(
      {
        getControllers: () => [
          ...viewerChild.blueprint().getControllers(),
          ...scalarChild.blueprint().getControllers(),
        ],
      },
      { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    expect(result.contributions).toHaveLength(2);
    expect(result.contributions.map((c) => c.key)).toEqual(
      expect.arrayContaining(['viewer', 'scalar']),
    );
    expect(result.contributions[0]?.importPath).not.toBe(result.contributions[1]?.importPath);
  });

  it('throws a graphql-specific error when two endpoints share the default key', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-key-collision-'));
    const viewerChild = graphql({ path: '/graphql', resolvers: [ViewerResolver] });
    const scalarChild = graphql({ path: '/other-graphql', resolvers: [PluginScalarResolver] });

    await expect(
      generateGraphqlSdl(
        {
          getControllers: () => [
            ...viewerChild.blueprint().getControllers(),
            ...scalarChild.blueprint().getControllers(),
          ],
        },
        { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
      ),
    ).rejects.toThrow(
      /GraphQL endpoints share the key "graphql"\. Pass a distinct `name` to each graphql\(\) to disambiguate\./,
    );
  });

  it('throws when two endpoint names only differ by case', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-case-collision-'));
    const adminChild = graphql({ path: '/admin', resolvers: [ViewerResolver], name: 'Admin' });
    const otherChild = graphql({
      path: '/other-admin',
      resolvers: [PluginScalarResolver],
      name: 'admin',
    });

    await expect(
      generateGraphqlSdl(
        {
          getControllers: () => [
            ...adminChild.blueprint().getControllers(),
            ...otherChild.blueprint().getControllers(),
          ],
        },
        { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
      ),
    ).rejects.toThrow(
      /GraphQL endpoints "Admin" and "admin" share the key "admin" case-insensitively\. Pass a distinct `name` to each graphql\(\) to disambiguate\./,
    );
  });

  it('does not throw when the same graphql() instance is mounted more than once', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-same-instance-'));
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver] });

    const result = await generateGraphqlSdl(
      {
        getControllers: () => [
          ...child.blueprint().getControllers(),
          ...child.blueprint().getControllers(),
        ],
      },
      { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    expect(result.contributions).toHaveLength(2);
    expect(result.contributions[0]).toEqual(result.contributions[1]);
  });

  it('embeds a resolversHash that matches computeGraphqlPrebuiltHash for the endpoint', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-hash-'));
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver] });

    const result = await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    const contribution = result.contributions[0];
    if (!contribution) throw new Error('missing contribution');
    const runtimeFile = resolve(cwd, `${contribution.importPath.replace('./', '.zelt/')}.ts`);
    const imported = await importFresh(runtimeFile);
    const expectedHash = await computeGraphqlPrebuiltHash('/graphql', [ViewerResolver]);
    expect((imported['graphqlPrebuilt'] as { resolversHash: string }).resolversHash).toBe(
      expectedHash,
    );
  });

  it('generates a runtime module with schema SDL and resolver bindings', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-runtime-'));
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver] });

    const result = await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    const contribution = result.contributions[0];
    if (!contribution) throw new Error('missing contribution');
    const runtimeFile = resolve(cwd, `${contribution.importPath.replace('./', '.zelt/')}.ts`);
    const generated = await readFile(runtimeFile, 'utf8');
    expect(generated).toContain('"schemaSdl"');
    expect(generated).toContain('"ViewerResolver"');
    expect(generated).toContain('"viewer"');

    const imported = await importFresh(runtimeFile);
    expect(imported['graphqlPrebuilt']).toMatchObject({
      runtime: {
        bindings: { Query: { viewer: { resolver: 'ViewerResolver', method: 'viewer' } } },
      },
    });
  });

  it('generates runtime module imports for scalar codecs', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-runtime-scalar-'));
    const child = graphql({ path: '/graphql', resolvers: [PluginScalarResolver] });

    const result = await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    const contribution = result.contributions[0];
    if (!contribution) throw new Error('missing contribution');
    const runtimeFile = resolve(cwd, `${contribution.importPath.replace('./', '.zelt/')}.ts`);
    const generated = await readFile(runtimeFile, 'utf8');
    expect(generated).toContain('PluginMoneyScalar');
    expect(generated).toContain('scalars');

    const imported = await importFresh(runtimeFile);
    expect(imported['graphqlPrebuilt']).toMatchObject({
      runtime: { scalars: { Money: PluginMoneyScalar } },
    });
  });
});

describe('graphqlPlugin', () => {
  it('generates the prebuilt module during preBuild and returns its contribution', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-plugin-'));
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver] });
    const plugin = graphqlPlugin({ tsconfig: resolve(__dirname, '../tsconfig.json') });

    const contributions = await plugin.preBuild?.({
      cwd,
      build: {},
      registerGeneratedFile: () => {},
      loadStaticApp: async () => ({
        http: { getControllers: () => child.blueprint().getControllers() },
      }),
    });

    const baseName = 'graphql.runtime';
    expect(contributions).toEqual([
      {
        feature: 'graphql',
        key: 'graphql',
        importPath: `./graphql/${baseName}`,
        exportName: 'graphqlPrebuilt',
      },
    ]);
    await expect(
      readFile(resolve(cwd, `.zelt/graphql/${baseName}.graphql`), 'utf8'),
    ).resolves.toContain('type ViewerPublic');
  });

  it('generates a schema-first prebuilt module from SDL and resolver bindings, plus resolverChecks next to the codegen helper', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-schema-first-'));
    const schemaPath = join(cwd, 'schema.graphql');
    const schemaSdl = `type Query {
  viewer: ViewerPublic
}

type ViewerPublic {
  id: String!
}
`;
    await writeFile(schemaPath, schemaSdl, 'utf8');
    const helperPath = join(cwd, 'graphql-generated.ts');
    await generateSchemaFirstCodegen({ schema: schemaPath, out: helperPath, cwd });

    const child = graphql({
      path: '/graphql',
      resolvers: [ViewerResolver],
      schema: { sdl: schemaSdl },
    });
    const plugin = graphqlPlugin({ tsconfig: resolve(__dirname, '../tsconfig.json') });

    const contributions = await plugin.preBuild?.({
      cwd,
      build: {},
      registerGeneratedFile: () => {},
      loadStaticApp: async () => ({
        http: { getControllers: () => child.blueprint().getControllers() },
      }),
    });

    const baseName = 'graphql.runtime';
    expect(contributions).toEqual([
      {
        feature: 'graphql',
        key: 'graphql',
        importPath: `./graphql/${baseName}`,
        exportName: 'graphqlPrebuilt',
      },
    ]);

    const runtimeFile = resolve(cwd, `.zelt/graphql/${baseName}.ts`);
    const generated = await readFile(runtimeFile, 'utf8');
    expect(generated).toContain('"schemaSdl"');
    expect(generated).toContain('viewer: ViewerPublic\\n');
    expect(generated).toContain('"ViewerResolver"');
    expect(generated).toContain('"viewer"');
    await expect(
      readFile(resolve(cwd, `.zelt/graphql/${baseName}.graphql`), 'utf8'),
    ).resolves.toContain('type Query');

    const resolverChecksPath = join(cwd, 'graphql-generated.resolver-checks.ts');
    const resolverChecksContent = await readFile(resolverChecksPath, 'utf8');
    expect(resolverChecksContent).toContain('Gql.Query.viewer.Result');
    expect(resolverChecksContent).toContain("from './graphql-generated'");
  });

  it('keeps two schema-first lines independent: each endpoint binds only its own schema and resolvers', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-two-lines-'));

    const schemaAPath = join(cwd, 'schema-a.graphql');
    const schemaASdl = `type Query {
  viewer: ViewerPublic
}

type ViewerPublic {
  id: String!
}
`;
    await writeFile(schemaAPath, schemaASdl, 'utf8');
    const helperAPath = join(cwd, 'graphql-a.ts');
    await generateSchemaFirstCodegen({ schema: schemaAPath, out: helperAPath, cwd });

    const schemaBPath = join(cwd, 'schema-b.graphql');
    const schemaBSdl = `type Query {
  pluginPrice: PluginPricePublic
}

type PluginPricePublic {
  amount: Float!
}
`;
    await writeFile(schemaBPath, schemaBSdl, 'utf8');
    const helperBPath = join(cwd, 'graphql-b.ts');
    await generateSchemaFirstCodegen({ schema: schemaBPath, out: helperBPath, cwd });

    const childA = graphql({
      path: '/graphql-a',
      resolvers: [ViewerResolver],
      name: 'lineA',
      schema: { sdl: schemaASdl },
    });
    const childB = graphql({
      path: '/graphql-b',
      resolvers: [PluginScalarResolver],
      name: 'lineB',
      schema: { sdl: schemaBSdl },
    });
    const plugin = graphqlPlugin({ tsconfig: resolve(__dirname, '../tsconfig.json') });

    await plugin.preBuild?.({
      cwd,
      build: {},
      registerGeneratedFile: () => {},
      loadStaticApp: async () => ({
        http: {
          getControllers: () => [
            ...childA.blueprint().getControllers(),
            ...childB.blueprint().getControllers(),
          ],
        },
      }),
    });

    const runtimeA = await readFile(resolve(cwd, '.zelt/graphql/lineA.runtime.ts'), 'utf8');
    expect(runtimeA).toContain('"ViewerResolver"');
    expect(runtimeA).not.toContain('PluginScalarResolver');

    const runtimeB = await readFile(resolve(cwd, '.zelt/graphql/lineB.runtime.ts'), 'utf8');
    expect(runtimeB).toContain('PluginScalarResolver');
    expect(runtimeB).not.toContain('ViewerResolver');

    await expect(readFile(join(cwd, 'graphql-a.resolver-checks.ts'), 'utf8')).resolves.toContain(
      'ViewerResolver',
    );
    await expect(readFile(join(cwd, 'graphql-b.resolver-checks.ts'), 'utf8')).resolves.toContain(
      'PluginScalarResolver',
    );
  });

  it('supports a code-first endpoint and a schema-first endpoint coexisting in the same app', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-mixed-'));

    const schemaPath = join(cwd, 'schema.graphql');
    const schemaSdl = `type Query {
  viewer: ViewerPublic
}

type ViewerPublic {
  id: String!
}
`;
    await writeFile(schemaPath, schemaSdl, 'utf8');
    const helperPath = join(cwd, 'graphql-generated.ts');
    await generateSchemaFirstCodegen({ schema: schemaPath, out: helperPath, cwd });

    const schemaFirstChild = graphql({
      path: '/graphql-schema-first',
      resolvers: [ViewerResolver],
      name: 'schemaFirst',
      schema: { sdl: schemaSdl },
    });
    const codeFirstChild = graphql({
      path: '/graphql-code-first',
      resolvers: [PluginScalarResolver],
      name: 'codeFirst',
    });
    const plugin = graphqlPlugin({ tsconfig: resolve(__dirname, '../tsconfig.json') });

    const contributions = await plugin.preBuild?.({
      cwd,
      build: {},
      registerGeneratedFile: () => {},
      loadStaticApp: async () => ({
        http: {
          getControllers: () => [
            ...schemaFirstChild.blueprint().getControllers(),
            ...codeFirstChild.blueprint().getControllers(),
          ],
        },
      }),
    });

    expect(contributions).toHaveLength(2);
    await expect(
      readFile(resolve(cwd, '.zelt/graphql/schemaFirst.runtime.graphql'), 'utf8'),
    ).resolves.toContain('type Query');
    await expect(
      readFile(resolve(cwd, '.zelt/graphql/codeFirst.runtime.graphql'), 'utf8'),
    ).resolves.toContain('type Query');
    await expect(
      readFile(join(cwd, 'graphql-generated.resolver-checks.ts'), 'utf8'),
    ).resolves.toContain('ViewerResolver');
  });

  it('fails with an actionable error when no codegen manifest entry matches the schema', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-missing-manifest-'));
    const schemaSdl = `type Query {
  viewer: ViewerPublic
}

type ViewerPublic {
  id: String!
}
`;
    const child = graphql({
      path: '/graphql',
      resolvers: [ViewerResolver],
      schema: { sdl: schemaSdl },
    });
    const plugin = graphqlPlugin({ tsconfig: resolve(__dirname, '../tsconfig.json') });

    await expect(
      plugin.preBuild?.({
        cwd,
        build: {},
        registerGeneratedFile: () => {},
        loadStaticApp: async () => ({
          http: { getControllers: () => child.blueprint().getControllers() },
        }),
      }),
    ).rejects.toThrow(/zelt graphql codegen/);
  });

  it('fails when two codegen helpers share the same sdlHash (ambiguous manifest match)', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-ambiguous-manifest-'));
    const schemaPath = join(cwd, 'schema.graphql');
    const schemaSdl = `type Query {
  viewer: ViewerPublic
}

type ViewerPublic {
  id: String!
}
`;
    await writeFile(schemaPath, schemaSdl, 'utf8');
    await generateSchemaFirstCodegen({ schema: schemaPath, out: join(cwd, 'helper-1.ts'), cwd });
    await generateSchemaFirstCodegen({ schema: schemaPath, out: join(cwd, 'helper-2.ts'), cwd });

    const child = graphql({
      path: '/graphql',
      resolvers: [ViewerResolver],
      schema: { sdl: schemaSdl },
    });
    const plugin = graphqlPlugin({ tsconfig: resolve(__dirname, '../tsconfig.json') });

    await expect(
      plugin.preBuild?.({
        cwd,
        build: {},
        registerGeneratedFile: () => {},
        loadStaticApp: async () => ({
          http: { getControllers: () => child.blueprint().getControllers() },
        }),
      }),
    ).rejects.toThrow(/helper-1\.ts.*helper-2\.ts|helper-2\.ts.*helper-1\.ts/s);
  });

  it('rejects a schema-first line missing a root Query/Mutation binding, scoped to that line only', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-missing-binding-'));
    const schemaSdl = `type Query {
  viewer: ViewerPublic
  other: ViewerPublic
}

type ViewerPublic {
  id: String!
}
`;
    const schemaPath = join(cwd, 'schema.graphql');
    await writeFile(schemaPath, schemaSdl, 'utf8');
    await generateSchemaFirstCodegen({
      schema: schemaPath,
      out: join(cwd, 'graphql-generated.ts'),
      cwd,
    });

    const child = graphql({
      path: '/graphql',
      resolvers: [ViewerResolver],
      schema: { sdl: schemaSdl },
    });
    const plugin = graphqlPlugin({ tsconfig: resolve(__dirname, '../tsconfig.json') });

    await expect(
      plugin.preBuild?.({
        cwd,
        build: {},
        registerGeneratedFile: () => {},
        loadStaticApp: async () => ({
          http: { getControllers: () => child.blueprint().getControllers() },
        }),
      }),
    ).rejects.toThrow('Schema-first resolver binding missing for Query.other');
  });

  // Invalid `name` values (slashes, backslashes, dots-only, reserved Windows
  // device names, ...) are now rejected by graphql() itself at construction
  // time — see graphql-child.test.ts — so they can no longer reach here.
});

describe('graphql codegen manifest recording via generateSchemaFirstCodegen', () => {
  it('is recorded deterministically and can be looked up by resolverChecks generation', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-manifest-lookup-'));
    const schemaPath = join(cwd, 'schema.graphql');
    const schemaSdl = `type Mutation {
  createUser: UserPublic
}

type Query {
  user: UserPublic
}

type UserPublic {
  id: String!
}
`;
    await writeFile(schemaPath, schemaSdl, 'utf8');
    const helperPath = join(cwd, 'graphql-generated.ts');
    await generateSchemaFirstCodegen({ schema: schemaPath, out: helperPath, cwd });

    const entries = await readGraphqlCodegenManifest(cwd);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.helperPath).toBe(resolve(helperPath));

    @Resolver()
    class UserResolver {
      @Query()
      user(): { readonly id: string } {
        return { id: '1' };
      }

      @Mutation()
      createUser(): { readonly id: string } {
        return { id: '2' };
      }
    }

    const child = graphql({
      path: '/graphql',
      resolvers: [UserResolver],
      schema: { sdl: schemaSdl },
    });
    const plugin = graphqlPlugin({ tsconfig: resolve(__dirname, '../tsconfig.json') });
    await plugin.preBuild?.({
      cwd,
      build: {},
      registerGeneratedFile: () => {},
      loadStaticApp: async () => ({
        http: { getControllers: () => child.blueprint().getControllers() },
      }),
    });

    await expect(
      readFile(join(cwd, 'graphql-generated.resolver-checks.ts'), 'utf8'),
    ).resolves.toContain('UserResolver');
  });
});
