import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';
import { generateGraphqlSdl, graphqlPlugin } from './graphql-plugin.lib';
import type { GqlOutput } from './index';
import { gqlScalar, graphql, Query, Resolver } from './index';

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

describe('generateGraphqlSdl', () => {
  it('discovers GraphQL controller markers from app.http.getControllers()', async () => {
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver] });
    const outDir = await mkdtemp(join(tmpdir(), 'zelt-graphql-'));

    const result = await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      { distDir: outDir, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    const schema = await readFile(join(outDir, 'schema.graphql'), 'utf8');
    expect(result.changed).toBe(true);
    expect(schema).toContain(`type Query {
  viewer: ViewerPublic!
}`);
  });
});

describe('graphqlPlugin', () => {
  it('generates schema.graphql during preBuild', async () => {
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver] });
    const outDir = await mkdtemp(join(tmpdir(), 'zelt-graphql-plugin-'));
    const plugin = graphqlPlugin({ outDir, tsconfig: resolve(__dirname, '../tsconfig.json') });

    await plugin.preBuild?.({
      cwd: process.cwd(),
      build: {},
      loadStaticApp: async () => ({
        http: { getControllers: () => child.blueprint().getControllers() },
      }),
    });

    await expect(readFile(join(outDir, 'schema.graphql'), 'utf8')).resolves.toContain(
      'type ViewerPublic',
    );
  });

  it('generates a runtime helper with schema SDL and resolver bindings', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'zelt-graphql-runtime-'));
    const runtimeModule = join(outDir, 'viewer-runtime.js');
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver], runtimeModule });

    await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      { distDir: outDir, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    const generated = await readFile(runtimeModule, 'utf8');
    expect(generated).toContain('export const graphqlRuntime');
    expect(generated).toContain('"schemaSdl"');
    expect(generated).toContain('"ViewerResolver"');
    expect(generated).toContain('"viewer"');
  });

  it('generates runtime helper imports for scalar codecs', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'zelt-graphql-runtime-scalar-'));
    const runtimeModule = join(outDir, 'scalar-runtime.js');
    const child = graphql({
      path: '/graphql',
      resolvers: [PluginScalarResolver],
      runtimeModule,
    });

    await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      { distDir: outDir, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    const generated = await readFile(runtimeModule, 'utf8');
    expect(generated).toContain('PluginMoneyScalar');
    expect(generated).toContain('scalars');

    const imported: { readonly graphqlRuntime?: unknown } = await import(
      /* @vite-ignore */ `${pathToFileURL(runtimeModule).href}?t=${Date.now()}`
    );
    expect(imported.graphqlRuntime).toMatchObject({
      scalars: { Money: PluginMoneyScalar },
    });
  });

  it('generates a schema-first runtime helper from SDL and resolver bindings', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'zelt-graphql-schema-first-'));
    const schema = join(outDir, 'schema.graphql');
    const runtimeModule = join(outDir, 'schema-first-runtime.js');
    const resolverChecks = join(outDir, 'graphql-resolver-checks.ts');
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
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver], runtimeModule });
    const plugin = graphqlPlugin({
      mode: 'schema-first',
      schema,
      runtimeModule,
      resolverChecks: {
        out: resolverChecks,
        gqlTypesImport: './graphql',
      },
      tsconfig: resolve(__dirname, '../tsconfig.json'),
    });

    await plugin.preBuild?.({
      cwd: process.cwd(),
      build: {},
      loadStaticApp: async () => ({
        http: { getControllers: () => child.blueprint().getControllers() },
      }),
    });

    const generated = await readFile(runtimeModule, 'utf8');
    expect(generated).toContain('export const graphqlRuntime');
    expect(generated).toContain('"schemaSdl"');
    expect(generated).toContain('viewer: ViewerPublic\\n');
    expect(generated).toContain('"ViewerResolver"');
    expect(generated).toContain('"viewer"');
    await expect(readFile(runtimeModule.replace(/\.js$/, '.graphql'), 'utf8')).resolves.toContain(
      'type Query',
    );
    await expect(readFile(resolverChecks, 'utf8')).resolves.toContain('Gql.Query.viewer.Result');
  });
});
