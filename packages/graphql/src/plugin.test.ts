import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { toJsonSchema } from '@valibot/to-json-schema';
import type { GenericSchema } from 'valibot';
import { describe, expect, it } from 'vitest';
import { GraphqlArgsValidationError } from './args.lib';
import { GetUserInput } from './gql-args-sample.lib';
import { NodeGetUserInput } from './gql-args-node-sample.js';
import { generateGraphqlSdl, graphqlPlugin } from './graphql-plugin.lib';
import type { GqlOutput } from './index';
import { args, gqlScalar, graphql, Query, Resolver } from './index';

function narrowToValibotSchema(value: unknown): GenericSchema;
function narrowToValibotSchema(value: unknown): unknown {
  return value;
}

const testSchemaAdapter = {
  toJsonSchema: (schema: unknown) => toJsonSchema(narrowToValibotSchema(schema)),
};

const testSchemaResolver = (modulePath: string): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ modulePath);

const execFile = promisify(execFileCallback);

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

@Resolver()
class PluginArgsResolver {
  @Query()
  userById(input = args(GetUserInput)): ViewerPublic {
    return { id: input.id };
  }
}

@Resolver()
class PluginNodeArgsResolver {
  @Query()
  nodeUserById(input = args(NodeGetUserInput)): ViewerPublic {
    return { id: input.id };
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
    const outDir = await mkdtemp(join(tmpdir(), 'zelt-graphql-'));
    const runtimeModule = join(outDir, 'viewer-runtime.js');
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver], runtimeModule });

    const result = await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      { distDir: outDir, tsconfig: resolve(__dirname, '../tsconfig.json') },
    );

    const schema = await readFile(runtimeModule.replace(/\.js$/, '.graphql'), 'utf8');
    expect(result.changed).toBe(true);
    expect(schema).toContain(`type Query {
  viewer: ViewerPublic!
}`);
  });
});

describe('graphqlPlugin', () => {
  it('generates schema.graphql during preBuild', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'zelt-graphql-plugin-'));
    const runtimeModule = join(outDir, 'viewer-runtime.js');
    const child = graphql({ path: '/graphql', resolvers: [ViewerResolver], runtimeModule });
    const plugin = graphqlPlugin({ outDir, tsconfig: resolve(__dirname, '../tsconfig.json') });

    await plugin.preBuild?.({
      cwd: process.cwd(),
      build: {},
      loadStaticApp: async () => ({
        http: { getControllers: () => child.blueprint().getControllers() },
      }),
    });

    await expect(readFile(runtimeModule.replace(/\.js$/, '.graphql'), 'utf8')).resolves.toContain(
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

  it('generates runtime helper imports for async args invocation hooks', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'zelt-graphql-runtime-args-'));
    const runtimeModule = join(outDir, 'args-runtime.js');
    const child = graphql({
      path: '/graphql',
      resolvers: [PluginArgsResolver],
      runtimeModule,
    });

    await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      {
        distDir: outDir,
        tsconfig: resolve(__dirname, '../tsconfig.json'),
        schemaAdapter: testSchemaAdapter,
        schemaResolver: testSchemaResolver,
      },
    );

    const imported: {
      readonly graphqlRuntime?: {
        readonly invocationHooks?: Record<string, unknown>;
      };
    } = await import(/* @vite-ignore */ `${pathToFileURL(runtimeModule).href}?t=${Date.now()}`);
    const hook = imported.graphqlRuntime?.invocationHooks?.['Query.userById'];

    expect(typeof hook).toBe('function');
    await expect(
      (hook as (ctx: {
        readonly parent: unknown;
        readonly args: Readonly<Record<string, unknown>>;
        readonly isRootField: boolean;
      }) => Promise<readonly unknown[]>)({
        parent: undefined,
        args: { id: 'user-1' },
        isRootField: true,
      }),
    ).resolves.toEqual([{ id: 'user-1' }]);
    await expect(
      (hook as (ctx: {
        readonly parent: unknown;
        readonly args: Readonly<Record<string, unknown>>;
        readonly isRootField: boolean;
      }) => Promise<readonly unknown[]>)({
        parent: undefined,
        args: { id: '' },
        isRootField: true,
      }),
    ).rejects.toBeInstanceOf(GraphqlArgsValidationError);
  });

  it('generates an args runtime helper that plain Node can import', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'zelt-graphql-runtime-node-'));
    const runtimeModule = join(outDir, 'node-runtime.mjs');
    const child = graphql({
      path: '/graphql',
      resolvers: [PluginNodeArgsResolver],
      runtimeModule,
    });

    await generateGraphqlSdl(
      { getControllers: () => child.blueprint().getControllers() },
      {
        distDir: outDir,
        tsconfig: resolve(__dirname, '../tsconfig.json'),
        schemaAdapter: testSchemaAdapter,
      },
    );

    const runtimeUrl = pathToFileURL(runtimeModule).href;
    const script = `
      const mod = await import(${JSON.stringify(runtimeUrl)});
      const hook = mod.graphqlRuntime.invocationHooks['Query.nodeUserById'];
      const result = await hook({ parent: undefined, args: { id: 'node-user' }, isRootField: true });
      console.log(JSON.stringify({ type: typeof hook, result }));
    `;

    await expect(
      execFile(process.execPath, ['--input-type=module', '-e', script]),
    ).resolves.toMatchObject({
      stdout: `${JSON.stringify({
        type: 'function',
        result: [{ id: 'node-user' }],
      })}\n`,
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
