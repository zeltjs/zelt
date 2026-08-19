import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';
import { generateGraphqlSdl, graphqlPlugin } from './graphql-plugin.lib';
import type { GqlOutput } from './index';
import { computeGraphqlPrebuiltHash, gqlScalar, graphql, Query, Resolver } from './index';

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
  it('writes the runtime and SDL under <cwd>/.zelt/graphql/, sanitizing the path into a filename', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-'));
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver] });

    const result = await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    expect(result.changed).toBe(true);
    const hash = await computeGraphqlPrebuiltHash('/graphql', [ViewerResolver]);
    const runtimeFile = resolve(cwd, `.zelt/graphql/graphql.${hash.slice(0, 8)}.runtime.ts`);
    const sdlFile = resolve(cwd, `.zelt/graphql/graphql.${hash.slice(0, 8)}.runtime.graphql`);
    await expect(readFile(sdlFile, 'utf8')).resolves.toContain(`type Query {
  viewer: ViewerPublic!
}`);
    await expect(readFile(runtimeFile, 'utf8')).resolves.toContain('export const graphqlPrebuilt');
  });

  it('sanitizes nested paths into double-underscore filenames', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-nested-'));
    const child = graphql({ path: '/api/v1/graphql', resolvers: [ViewerResolver] });

    await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    const hash = await computeGraphqlPrebuiltHash('/api/v1/graphql', [ViewerResolver]);
    await expect(
      readFile(
        resolve(cwd, `.zelt/graphql/api__v1__graphql.${hash.slice(0, 8)}.runtime.ts`),
        'utf8',
      ),
    ).resolves.toContain('export const graphqlPrebuilt');
  });

  it('returns a PrebuiltContribution pointing at the generated module', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-contribution-'));
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver] });

    const result = await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    const hash = await computeGraphqlPrebuiltHash('/graphql', [ViewerResolver]);
    const baseName = `graphql.${hash.slice(0, 8)}.runtime`;
    expect(result.contributions).toEqual([
      {
        feature: 'graphql',
        key: `/graphql#${hash}`,
        importPath: `./graphql/${baseName}`,
        exportName: 'graphqlPrebuilt',
      },
    ]);
  });

  it('lets two endpoints that mount the same path with different resolvers coexist', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-collision-'));
    const viewerChild = graphql({ path: '/graphql', resolvers: [ViewerResolver] });
    const scalarChild = graphql({ path: '/graphql', resolvers: [PluginScalarResolver] });

    const result = await generateGraphqlSdl(
      {
        getControllers: () => [
          ...viewerChild.blueprint().getControllers(),
          ...scalarChild.blueprint().getControllers(),
        ],
      },
      { cwd, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    const viewerHash = await computeGraphqlPrebuiltHash('/graphql', [ViewerResolver]);
    const scalarHash = await computeGraphqlPrebuiltHash('/graphql', [PluginScalarResolver]);
    expect(result.contributions).toHaveLength(2);
    expect(result.contributions.map((c) => c.key)).toEqual(
      expect.arrayContaining([`/graphql#${viewerHash}`, `/graphql#${scalarHash}`]),
    );
    expect(result.contributions[0]?.importPath).not.toBe(result.contributions[1]?.importPath);
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
      loadStaticApp: async () => ({
        http: { getControllers: () => child.blueprint().getControllers() },
      }),
    });

    const hash = await computeGraphqlPrebuiltHash('/graphql', [ViewerResolver]);
    const baseName = `graphql.${hash.slice(0, 8)}.runtime`;
    expect(contributions).toEqual([
      {
        feature: 'graphql',
        key: `/graphql#${hash}`,
        importPath: `./graphql/${baseName}`,
        exportName: 'graphqlPrebuilt',
      },
    ]);
    await expect(
      readFile(resolve(cwd, `.zelt/graphql/${baseName}.graphql`), 'utf8'),
    ).resolves.toContain('type ViewerPublic');
  });

  it('generates a schema-first prebuilt module from SDL and resolver bindings', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'zelt-graphql-schema-first-'));
    const schema = join(cwd, 'schema.graphql');
    const resolverChecks = join(cwd, 'graphql-resolver-checks.ts');
    await writeFile(
      schema,
      `type Query {
  viewer: ViewerPublic
}

type ViewerPublic {
  id: String!
}
`,
      'utf8',
    );
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver] });
    const plugin = graphqlPlugin({
      mode: 'schema-first',
      schema,
      resolverChecks: {
        out: resolverChecks,
        gqlTypesImport: './graphql',
      },
      tsconfig: resolve(__dirname, '../tsconfig.json'),
    });

    const contributions = await plugin.preBuild?.({
      cwd,
      build: {},
      loadStaticApp: async () => ({
        http: { getControllers: () => child.blueprint().getControllers() },
      }),
    });

    const hash = await computeGraphqlPrebuiltHash('/graphql', [ViewerResolver]);
    const baseName = `graphql.${hash.slice(0, 8)}.runtime`;
    expect(contributions).toEqual([
      {
        feature: 'graphql',
        key: `/graphql#${hash}`,
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
    await expect(readFile(resolverChecks, 'utf8')).resolves.toContain('Gql.Query.viewer.Result');
  });
});
