import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { PrebuiltContribution, ZeltPlugin } from '@zeltjs/cli';
import type { ControllerClass, HttpStaticCapabilities } from '@zeltjs/core';
import { GRAPHQL_FEATURE_KEY } from './graphql-child.lib';
import type { GraphqlResolverClass } from './graphql-metadata.lib';
import { getGraphqlControllerMetadata } from './graphql-metadata.lib';
import type { GraphqlRuntimeManifest } from './graphql-runtime.lib';
import type { GenerateSdlOptions } from './graphql-sdl-generator.lib';
import { generateGraphqlRuntimeForResolvers } from './graphql-sdl-generator.lib';
import { computeGraphqlPrebuiltHash } from './prebuilt-hash.lib';
import type { GenerateSchemaFirstResolverChecksOptions } from './schema-first-resolver-checks.lib';
import { generateSchemaFirstResolverChecks } from './schema-first-resolver-checks.lib';
import { generateSchemaFirstGraphqlRuntimeForResolvers } from './schema-first-runtime.lib';

type HttpStaticApp = {
  readonly http: Pick<HttpStaticCapabilities, 'getControllers'>;
};

export type GraphqlPrebuiltContribution = PrebuiltContribution;

export type GraphqlPluginOptions = {
  readonly mode?: 'code-first' | 'schema-first';
  readonly schema?: string;
  readonly resolverChecks?: Pick<
    GenerateSchemaFirstResolverChecksOptions,
    'out' | 'gqlTypesImport'
  >;
  readonly tsconfig?: string;
  readonly schemaAdapter?: GenerateSdlOptions['schemaAdapter'];
  readonly schemaResolver?: GenerateSdlOptions['schemaResolver'];
  readonly scalarResolver?: GenerateSdlOptions['scalarResolver'];
};

export type GenerateGraphqlSdlOptions = GenerateSdlOptions & {
  readonly cwd: string;
  readonly mode?: 'code-first' | 'schema-first';
  readonly schema?: string;
  readonly resolverChecks?: Pick<
    GenerateSchemaFirstResolverChecksOptions,
    'out' | 'gqlTypesImport'
  >;
};

export type GenerateGraphqlSdlResult = {
  readonly changed: boolean;
  readonly contributions: readonly GraphqlPrebuiltContribution[];
};

const writeIfChanged = async (path: string, content: string): Promise<boolean> => {
  if (existsSync(path)) {
    const existing = await readFile(path, 'utf8');
    if (existing === content) return false;
  }
  await writeFile(path, content, 'utf8');
  return true;
};

type GraphqlEndpoint = {
  readonly key: string;
  readonly path: string;
  readonly resolvers: readonly NonNullable<
    ReturnType<typeof getGraphqlControllerMetadata>
  >['resolvers'][number][];
};

const collectGraphqlEndpoints = (
  controllers: readonly ControllerClass[],
): readonly GraphqlEndpoint[] => {
  const endpoints: GraphqlEndpoint[] = [];
  for (const controller of controllers) {
    const metadata = getGraphqlControllerMetadata(controller);
    if (!metadata) continue;
    endpoints.push({ key: metadata.key, path: metadata.path, resolvers: metadata.resolvers });
  }
  return endpoints;
};

const toImportSpecifier = (modulePath: string): string => {
  if (
    modulePath.startsWith('file:') ||
    modulePath.startsWith('node:') ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(modulePath)
  ) {
    return modulePath;
  }
  if (isAbsolute(modulePath) || modulePath.startsWith('./') || modulePath.startsWith('../')) {
    return pathToFileURL(resolve(modulePath)).href;
  }
  return modulePath;
};

const toSerializableRuntime = (
  runtime: GraphqlRuntimeManifest,
): Omit<GraphqlRuntimeManifest, 'scalars'> => ({
  schemaSdl: runtime.schemaSdl,
  bindings: runtime.bindings,
  ...(runtime.enumFields !== undefined && { enumFields: runtime.enumFields }),
  ...(runtime.scalarRefs !== undefined && { scalarRefs: runtime.scalarRefs }),
  ...(runtime.unions !== undefined && { unions: runtime.unions }),
});

const buildScalarImports = (runtime: GraphqlRuntimeManifest): string => {
  const refs = Object.entries(runtime.scalarRefs ?? {});
  if (refs.length === 0) return '';
  const lines = refs.map(
    ([, ref], index) =>
      `import * as graphqlScalarModule${index} from ${JSON.stringify(toImportSpecifier(ref.modulePath))};`,
  );
  return `${lines.join('\n')}\n\n`;
};

const buildScalarObjectLiteral = (runtime: GraphqlRuntimeManifest): string | undefined => {
  const refs = Object.entries(runtime.scalarRefs ?? {});
  if (refs.length === 0) return undefined;
  const entries = refs.map(
    ([typeName, ref], index) =>
      `    ${JSON.stringify(typeName)}: graphqlScalarModule${index}[${JSON.stringify(ref.exportName)}]`,
  );
  return `  "scalars": {\n${entries.join(',\n')}\n  }`;
};

const buildRuntimeLiteral = (runtime: GraphqlRuntimeManifest): string => {
  const runtimeJson = JSON.stringify(toSerializableRuntime(runtime), null, 2);
  const scalarLiteral = buildScalarObjectLiteral(runtime);
  if (!scalarLiteral) return runtimeJson;
  const trimmed = runtimeJson.replace(/\n}$/, '');
  return `${trimmed},\n${scalarLiteral}\n}`;
};

const buildPrebuiltModule = (runtime: GraphqlRuntimeManifest, resolversHash: string): string => {
  const imports = buildScalarImports(runtime);
  const runtimeLiteral = buildRuntimeLiteral(runtime);
  return `${imports}export const graphqlPrebuilt = {
  "runtime": ${runtimeLiteral},
  "resolversHash": ${JSON.stringify(resolversHash)}
};\n`;
};

// GraphQL endpoint keys become filenames: 'graphql' -> 'graphql', a `name`
// of 'api/v1' -> 'api__v1'. Keys don't normally contain '/', but it's
// stripped defensively in case one ever does.
const sanitizeGraphqlKey = (key: string): string => {
  const trimmed = key.replace(/^\/+|\/+$/g, '').replace(/\//g, '__');
  return trimmed.length > 0 ? trimmed : GRAPHQL_FEATURE_KEY;
};

// Two endpoints sharing a key is only valid when they are the same
// declaration mounted twice (e.g. the same graphql() instance reused across
// children arrays); the cli's prebuilt writer already dedupes that case by
// contribution equality. Any other same-key collision is a configuration
// mistake, so it is rejected here with a graphql-specific, actionable
// message instead of surfacing as a generic duplicate-contribution error.
const isSameGraphqlEndpoint = (a: GraphqlEndpoint, b: GraphqlEndpoint): boolean =>
  a.path === b.path &&
  a.resolvers.length === b.resolvers.length &&
  a.resolvers.every((resolver, index) => resolver === b.resolvers[index]);

/** @throws {Error} */
const assertUniqueGraphqlEndpointKeys = (endpoints: readonly GraphqlEndpoint[]): void => {
  const byKey = new Map<string, GraphqlEndpoint>();
  const filenameOwners = new Map<string, string>();
  for (const endpoint of endpoints) {
    const existingByKey = byKey.get(endpoint.key);
    if (existingByKey === undefined) {
      byKey.set(endpoint.key, endpoint);
    } else if (!isSameGraphqlEndpoint(existingByKey, endpoint)) {
      throw new Error(
        `GraphQL endpoints share the key "${endpoint.key}". Pass a distinct \`name\` to each graphql() to disambiguate.`,
      );
    }

    const filename = sanitizeGraphqlKey(endpoint.key);
    const filenameOwner = filenameOwners.get(filename);
    if (filenameOwner === undefined) {
      filenameOwners.set(filename, endpoint.key);
    } else if (filenameOwner !== endpoint.key) {
      throw new Error(
        `GraphQL endpoints "${filenameOwner}" and "${endpoint.key}" both sanitize to the filename "${filename}". Pass a distinct \`name\` to each graphql() to disambiguate.`,
      );
    }
  }
};

const graphqlOutDir = (cwd: string): string => resolve(cwd, '.zelt', 'graphql');

type WriteEndpointModuleResult = {
  readonly changed: boolean;
  readonly contribution: GraphqlPrebuiltContribution;
};

const writeGraphqlEndpointModule = async (
  cwd: string,
  endpoint: GraphqlEndpoint,
  runtime: GraphqlRuntimeManifest,
): Promise<WriteEndpointModuleResult> => {
  const outDir = graphqlOutDir(cwd);
  await mkdir(outDir, { recursive: true });
  const resolversHash = await computeGraphqlPrebuiltHash(endpoint.path, endpoint.resolvers);
  const baseName = `${sanitizeGraphqlKey(endpoint.key)}.runtime`;
  const runtimeFilePath = resolve(outDir, `${baseName}.ts`);
  const sdlFilePath = resolve(outDir, `${baseName}.graphql`);
  const runtimeChanged = await writeIfChanged(
    runtimeFilePath,
    buildPrebuiltModule(runtime, resolversHash),
  );
  const sdlChanged = await writeIfChanged(sdlFilePath, runtime.schemaSdl);
  return {
    changed: runtimeChanged || sdlChanged,
    contribution: {
      feature: GRAPHQL_FEATURE_KEY,
      key: endpoint.key,
      importPath: `./graphql/${baseName}`,
      exportName: 'graphqlPrebuilt',
    },
  };
};

type SdlAdapterOptions = {
  readonly tsconfig?: GenerateSdlOptions['tsconfig'];
  readonly schemaAdapter?: GenerateSdlOptions['schemaAdapter'];
  readonly schemaResolver?: GenerateSdlOptions['schemaResolver'];
  readonly scalarResolver?: GenerateSdlOptions['scalarResolver'];
};

const toSdlOptions = (options: SdlAdapterOptions): GenerateSdlOptions => ({
  ...(options.tsconfig !== undefined && { tsconfig: options.tsconfig }),
  ...(options.schemaAdapter !== undefined && { schemaAdapter: options.schemaAdapter }),
  ...(options.schemaResolver !== undefined && { schemaResolver: options.schemaResolver }),
  ...(options.scalarResolver !== undefined && { scalarResolver: options.scalarResolver }),
});

type GenerateEndpointsResult = {
  readonly changed: boolean;
  readonly contributions: readonly GraphqlPrebuiltContribution[];
};

const writeGraphqlEndpointModules = async (
  cwd: string,
  endpoints: readonly GraphqlEndpoint[],
  runtimeFor: (endpoint: GraphqlEndpoint) => Promise<GraphqlRuntimeManifest>,
): Promise<GenerateEndpointsResult> => {
  let changed = false;
  const contributions: GraphqlPrebuiltContribution[] = [];
  for (const endpoint of endpoints) {
    const runtime = await runtimeFor(endpoint);
    const result = await writeGraphqlEndpointModule(cwd, endpoint, runtime);
    changed = changed || result.changed;
    contributions.push(result.contribution);
  }
  return { changed, contributions };
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const generateCodeFirstEndpoints = (
  endpoints: readonly GraphqlEndpoint[],
  options: GenerateGraphqlSdlOptions,
): Promise<GenerateEndpointsResult> =>
  writeGraphqlEndpointModules(options.cwd, endpoints, (endpoint) =>
    generateGraphqlRuntimeForResolvers(endpoint.resolvers, toSdlOptions(options)),
  );

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const generateResolverChecksIfRequested = async (
  schemaSdl: string,
  resolvers: readonly GraphqlResolverClass[],
  options: GenerateGraphqlSdlOptions,
): Promise<boolean> => {
  if (!options.resolverChecks) return false;
  const result = await generateSchemaFirstResolverChecks({
    schemaSdl,
    resolvers,
    out: options.resolverChecks.out,
    gqlTypesImport: options.resolverChecks.gqlTypesImport,
    ...(options.tsconfig !== undefined && { tsconfig: options.tsconfig }),
  });
  return result.changed;
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const generateSchemaFirstEndpoints = async (
  endpoints: readonly GraphqlEndpoint[],
  options: GenerateGraphqlSdlOptions,
): Promise<GenerateEndpointsResult> => {
  if (!options.schema) {
    throw new Error('schema-first graphqlPlugin requires schema.');
  }
  const schemaSdl = await readFile(resolve(options.schema), 'utf8');
  const allResolvers = endpoints.flatMap((endpoint) => endpoint.resolvers);
  const runtime = await generateSchemaFirstGraphqlRuntimeForResolvers(allResolvers, {
    schemaSdl,
    ...(options.tsconfig !== undefined && { tsconfig: options.tsconfig }),
  });

  const written = await writeGraphqlEndpointModules(options.cwd, endpoints, () =>
    Promise.resolve(runtime),
  );
  const resolverChecksChanged = await generateResolverChecksIfRequested(
    schemaSdl,
    allResolvers,
    options,
  );

  return {
    changed: written.changed || resolverChecksChanged,
    contributions: written.contributions,
  };
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const generateGraphqlSdl = async (
  app: Pick<HttpStaticCapabilities, 'getControllers'>,
  options: GenerateGraphqlSdlOptions,
): Promise<GenerateGraphqlSdlResult> => {
  const endpoints = collectGraphqlEndpoints(app.getControllers());
  assertUniqueGraphqlEndpointKeys(endpoints);
  const result =
    options.mode === 'schema-first' || options.schema !== undefined
      ? await generateSchemaFirstEndpoints(endpoints, options)
      : await generateCodeFirstEndpoints(endpoints, options);
  return { changed: result.changed, contributions: result.contributions };
};

const toGenerateOptions = (
  cwd: string,
  options: GraphqlPluginOptions,
): GenerateGraphqlSdlOptions => ({
  cwd,
  ...toSdlOptions(options),
  ...(options.mode !== undefined && { mode: options.mode }),
  ...(options.schema !== undefined && { schema: options.schema }),
  ...(options.resolverChecks !== undefined && { resolverChecks: options.resolverChecks }),
});

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const graphqlPlugin = (options: GraphqlPluginOptions = {}): ZeltPlugin<HttpStaticApp> => ({
  name: 'graphql',
  async preBuild(ctx) {
    const app = await ctx.loadStaticApp();
    const { contributions } = await generateGraphqlSdl(
      app.http,
      toGenerateOptions(ctx.cwd, options),
    );
    return contributions;
  },
});
