import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { generateGraphqlSdl, graphqlPlugin } from './graphql-plugin.lib';
import { graphql, Query, Resolver } from './index';

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

describe('generateGraphqlSdl', () => {
  it('discovers GraphQL controller markers from app.http.getControllers()', async () => {
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver] });
    const outDir = await mkdtemp(join(tmpdir(), 'zelt-graphql-'));

    const result = await generateGraphqlSdl(
      { getControllers: () => child.staticCapabilities().getControllers() },
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
        http: { getControllers: () => child.staticCapabilities().getControllers() },
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
      { getControllers: () => child.staticCapabilities().getControllers() },
      { distDir: outDir, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    const generated = await readFile(runtimeModule, 'utf8');
    expect(generated).toContain('export const graphqlRuntime');
    expect(generated).toContain('"schemaSdl"');
    expect(generated).toContain('"ViewerResolver"');
    expect(generated).toContain('"viewer"');
  });
});
