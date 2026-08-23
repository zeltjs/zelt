import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PrebuiltContribution, ZeltPlugin } from '@zeltjs/cli';
import { GENERATED_FILE_HEADER_MARKER } from '@zeltjs/cli';
import type { ControllerClass, HttpStaticCapabilities } from '@zeltjs/core';
import { GRAPHQL_FEATURE_KEY } from './graphql-child.lib';
import {
  computeSchemaSdlHash,
  findGraphqlCodegenManifestEntryBySdlHash,
} from './graphql-codegen-manifest.lib';
import type { GqlSchemaRef } from './graphql-metadata.lib';
import { getGraphqlControllerMetadata } from './graphql-metadata.lib';
import type { GraphqlRuntimeManifest } from './graphql-runtime.lib';
import type { GenerateSdlOptions } from './graphql-sdl-generator.lib';
import { generateGraphqlRuntimeForResolvers } from './graphql-sdl-generator.lib';
import { computeGraphqlPrebuiltHash } from './prebuilt-hash.lib';
import {
  generateSchemaFirstResolverChecks,
  toResolverChecksImportSpecifier,
} from './schema-first-resolver-checks.lib';
import { generateSchemaFirstGraphqlRuntimeForResolvers } from './schema-first-runtime.lib';

type HttpStaticApp = {
  readonly http: Pick<HttpStaticCapabilities, 'getControllers'>;
};

export type GraphqlPrebuiltContribution = PrebuiltContribution;

export type GraphqlPluginOptions = {
  readonly tsconfig?: string;
  readonly schemaAdapter?: GenerateSdlOptions['schemaAdapter'];
  readonly schemaResolver?: GenerateSdlOptions['schemaResolver'];
  readonly scalarResolver?: GenerateSdlOptions['scalarResolver'];
};

export type GenerateGraphqlSdlOptions = GenerateSdlOptions & {
  readonly cwd: string;
};

export type GenerateGraphqlSdlResult = {
  readonly changed: boolean;
  readonly contributions: readonly GraphqlPrebuiltContribution[];
  // Absolute paths of every runtime module, SDL file, and resolverChecks
  // file this run wrote or verified unchanged — passed to the build's
  // output ledger so a later run can prune files an endpoint stops
  // producing (see `registerGeneratedFile` on `BuildContext`).
  readonly generatedFiles: readonly string[];
};

const writeIfChanged = async (path: string, content: string): Promise<boolean> => {
  if (existsSync(path)) {
    const existing = await readFile(path, 'utf8');
    if (existing === content) return false;
  }
  await writeFile(path, content, 'utf8');
  return true;
};

// Each endpoint forms its own line from schema (or resolver code) through to
// the generated runtime module: `schema` present selects schema-first,
// absent selects code-first. Lines never mix resolvers across endpoints.
type GraphqlEndpoint = {
  readonly key: string;
  readonly path: string;
  readonly resolvers: readonly NonNullable<
    ReturnType<typeof getGraphqlControllerMetadata>
  >['resolvers'][number][];
  readonly schema?: GqlSchemaRef;
};

const collectGraphqlEndpoints = (
  controllers: readonly ControllerClass[],
): readonly GraphqlEndpoint[] => {
  const endpoints: GraphqlEndpoint[] = [];
  for (const controller of controllers) {
    const metadata = getGraphqlControllerMetadata(controller);
    if (!metadata) continue;
    endpoints.push({
      key: metadata.key,
      path: metadata.path,
      resolvers: metadata.resolvers,
      ...(metadata.schema !== undefined && { schema: metadata.schema }),
    });
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

const GRAPHQL_GENERATED_TS_HEADER = `// ${GENERATED_FILE_HEADER_MARKER}`;
const GRAPHQL_GENERATED_SDL_HEADER = `# ${GENERATED_FILE_HEADER_MARKER}`;

const buildPrebuiltModule = (runtime: GraphqlRuntimeManifest, resolversHash: string): string => {
  const imports = buildScalarImports(runtime);
  const runtimeLiteral = buildRuntimeLiteral(runtime);
  return `${GRAPHQL_GENERATED_TS_HEADER}\n${imports}export const graphqlPrebuilt = {
  "runtime": ${runtimeLiteral},
  "resolversHash": ${JSON.stringify(resolversHash)}
};\n`;
};

const buildSdlFileContent = (schemaSdl: string): string =>
  `${GRAPHQL_GENERATED_SDL_HEADER}\n\n${schemaSdl}`;

// Two endpoints sharing a key is only valid when they are the same
// declaration mounted twice (e.g. the same graphql() instance reused across
// children arrays); the cli's prebuilt writer already dedupes that case by
// contribution equality. Any other same-key collision is a configuration
// mistake, so it is rejected here with a graphql-specific, actionable
// message instead of surfacing as a generic duplicate-contribution error.
const isSameGraphqlEndpoint = (a: GraphqlEndpoint, b: GraphqlEndpoint): boolean =>
  a.path === b.path &&
  a.schema === b.schema &&
  a.resolvers.length === b.resolvers.length &&
  a.resolvers.every((resolver, index) => resolver === b.resolvers[index]);

/** @throws {Error} */
const assertUniqueGraphqlEndpointKeys = (endpoints: readonly GraphqlEndpoint[]): void => {
  const byKey = new Map<string, GraphqlEndpoint>();
  // `name` is validated to a filesystem-safe identifier at graphql() call
  // time, so the key doubles as the generated filename directly; only a
  // case-only collision (e.g. 'Admin' vs 'admin') can still clash, since
  // most filesystems treat those as the same path.
  const byLowercaseKey = new Map<string, string>();
  for (const endpoint of endpoints) {
    const existingByKey = byKey.get(endpoint.key);
    if (existingByKey === undefined) {
      byKey.set(endpoint.key, endpoint);
    } else if (!isSameGraphqlEndpoint(existingByKey, endpoint)) {
      throw new Error(
        `GraphQL endpoints share the key "${endpoint.key}". Pass a distinct \`name\` to each graphql() to disambiguate.`,
      );
    }

    const lowercaseKey = endpoint.key.toLowerCase();
    const owner = byLowercaseKey.get(lowercaseKey);
    if (owner === undefined) {
      byLowercaseKey.set(lowercaseKey, endpoint.key);
    } else if (owner !== endpoint.key) {
      throw new Error(
        `GraphQL endpoints "${owner}" and "${endpoint.key}" share the key "${lowercaseKey}" case-insensitively. Pass a distinct \`name\` to each graphql() to disambiguate.`,
      );
    }
  }
};

const graphqlOutDir = (cwd: string): string => resolve(cwd, '.zelt', 'graphql');

/** @throws {Error} */
const assertWithinOutDir = (outDir: string, filePath: string): void => {
  const rel = relative(outDir, filePath);
  if (rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new Error(`GraphQL generated file path escapes the output directory: ${filePath}`);
  }
};

type WriteEndpointModuleResult = {
  readonly changed: boolean;
  readonly contribution: GraphqlPrebuiltContribution;
  readonly generatedFiles: readonly string[];
};

/** @throws {Error} */
const writeGraphqlEndpointModule = async (
  cwd: string,
  endpoint: GraphqlEndpoint,
  runtime: GraphqlRuntimeManifest,
): Promise<WriteEndpointModuleResult> => {
  const outDir = graphqlOutDir(cwd);
  await mkdir(outDir, { recursive: true });
  const resolversHash = await computeGraphqlPrebuiltHash(endpoint.path, endpoint.resolvers);
  const baseName = `${endpoint.key}.runtime`;
  const runtimeFilePath = resolve(outDir, `${baseName}.ts`);
  const sdlFilePath = resolve(outDir, `${baseName}.graphql`);
  assertWithinOutDir(outDir, runtimeFilePath);
  assertWithinOutDir(outDir, sdlFilePath);
  const runtimeChanged = await writeIfChanged(
    runtimeFilePath,
    buildPrebuiltModule(runtime, resolversHash),
  );
  const sdlChanged = await writeIfChanged(sdlFilePath, buildSdlFileContent(runtime.schemaSdl));
  return {
    changed: runtimeChanged || sdlChanged,
    contribution: {
      feature: GRAPHQL_FEATURE_KEY,
      key: endpoint.key,
      importPath: `./graphql/${baseName}`,
      exportName: 'graphqlPrebuilt',
    },
    generatedFiles: [runtimeFilePath, sdlFilePath],
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

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const generateRuntimeForEndpoint = (
  endpoint: GraphqlEndpoint,
  options: GenerateGraphqlSdlOptions,
): Promise<GraphqlRuntimeManifest> =>
  endpoint.schema
    ? generateSchemaFirstGraphqlRuntimeForResolvers(endpoint.resolvers, {
        schemaSdl: endpoint.schema.sdl,
        ...(options.tsconfig !== undefined && { tsconfig: options.tsconfig }),
      })
    : generateGraphqlRuntimeForResolvers(endpoint.resolvers, toSdlOptions(options));

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const writeGraphqlEndpointModules = async (
  endpoints: readonly GraphqlEndpoint[],
  options: GenerateGraphqlSdlOptions,
): Promise<GenerateGraphqlSdlResult> => {
  let changed = false;
  const contributions: GraphqlPrebuiltContribution[] = [];
  const generatedFiles: string[] = [];
  for (const endpoint of endpoints) {
    const runtime = await generateRuntimeForEndpoint(endpoint, options);
    const result = await writeGraphqlEndpointModule(options.cwd, endpoint, runtime);
    changed = changed || result.changed;
    contributions.push(result.contribution);
    generatedFiles.push(...result.generatedFiles);
  }
  return { changed, contributions, generatedFiles };
};

type SchemaFirstGraphqlEndpoint = GraphqlEndpoint & { readonly schema: GqlSchemaRef };

const collectSchemaFirstEndpoints = (
  endpoints: readonly GraphqlEndpoint[],
): readonly SchemaFirstGraphqlEndpoint[] =>
  endpoints.flatMap((endpoint) =>
    endpoint.schema !== undefined ? [{ ...endpoint, schema: endpoint.schema }] : [],
  );

/** @throws {Error} */
const resolveCodegenHelperPath = async (
  endpoint: SchemaFirstGraphqlEndpoint,
  cwd: string,
): Promise<string> => {
  const sdlHash = await computeSchemaSdlHash(endpoint.schema.sdl);
  const result = await findGraphqlCodegenManifestEntryBySdlHash(cwd, sdlHash);
  if (result.kind === 'missing') {
    throw new Error(
      `No GraphQL codegen manifest entry found for the schema of GraphQL endpoint "${endpoint.key}". Run \`zelt graphql codegen --schema <path-to-schema> --out <path-to-helper>\` first.`,
    );
  }
  if (result.kind === 'ambiguous') {
    throw new Error(
      `Multiple GraphQL codegen helpers share the same schema as GraphQL endpoint "${endpoint.key}": ${result.entries
        .map((entry) => entry.helperPath)
        .join(', ')}. Each schema-first schema must be codegen'd to exactly one helper.`,
    );
  }
  return result.entry.helperPath;
};

const resolverChecksOutPath = (
  helperPath: string,
  endpointKey: string,
  needsSuffix: boolean,
): string => {
  const ext = extname(helperPath);
  const base = helperPath.slice(0, helperPath.length - ext.length);
  const suffix = needsSuffix ? `.${endpointKey}` : '';
  return `${base}${suffix}.resolver-checks.ts`;
};

type ResolvedSchemaFirstEndpoint = {
  readonly endpoint: SchemaFirstGraphqlEndpoint;
  readonly helperPath: string;
};

const countByHelperPath = (
  resolved: readonly ResolvedSchemaFirstEndpoint[],
): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const { helperPath } of resolved) {
    counts.set(helperPath, (counts.get(helperPath) ?? 0) + 1);
  }
  return counts;
};

type ResolverChecksGenerationResult = {
  readonly changed: boolean;
  readonly out: string;
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const generateResolverChecksForResolvedEndpoint = async (
  resolved: ResolvedSchemaFirstEndpoint,
  needsSuffix: boolean,
  options: GenerateGraphqlSdlOptions,
): Promise<ResolverChecksGenerationResult> => {
  const out = resolverChecksOutPath(resolved.helperPath, resolved.endpoint.key, needsSuffix);
  const result = await generateSchemaFirstResolverChecks({
    schemaSdl: resolved.endpoint.schema.sdl,
    resolvers: resolved.endpoint.resolvers,
    out,
    gqlTypesImport: toResolverChecksImportSpecifier(out, resolved.helperPath),
    ...(options.tsconfig !== undefined && { tsconfig: options.tsconfig }),
  });
  return { changed: result.changed, out: resolve(out) };
};

type ResolverChecksGenerationSummary = {
  readonly changed: boolean;
  readonly generatedFiles: readonly string[];
};

// resolverChecks generation has no configuration: every schema-first
// endpoint gets a check file next to the codegen helper its schema hashes
// to, discovered via <cwd>/.zelt/graphql-codegen.json.
/** @throws {Error | UnsupportedTypeScriptVersionError} */
const generateResolverChecksForSchemaFirstEndpoints = async (
  endpoints: readonly GraphqlEndpoint[],
  options: GenerateGraphqlSdlOptions,
): Promise<ResolverChecksGenerationSummary> => {
  const schemaFirstEndpoints = collectSchemaFirstEndpoints(endpoints);
  if (schemaFirstEndpoints.length === 0) return { changed: false, generatedFiles: [] };

  const resolved = await Promise.all(
    schemaFirstEndpoints.map(async (endpoint) => ({
      endpoint,
      helperPath: await resolveCodegenHelperPath(endpoint, options.cwd),
    })),
  );
  const helperPathCounts = countByHelperPath(resolved);

  let changed = false;
  const generatedFiles: string[] = [];
  for (const entry of resolved) {
    const needsSuffix = (helperPathCounts.get(entry.helperPath) ?? 0) > 1;
    const entryResult = await generateResolverChecksForResolvedEndpoint(
      entry,
      needsSuffix,
      options,
    );
    changed = changed || entryResult.changed;
    generatedFiles.push(entryResult.out);
  }
  return { changed, generatedFiles };
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const generateGraphqlSdl = async (
  app: Pick<HttpStaticCapabilities, 'getControllers'>,
  options: GenerateGraphqlSdlOptions,
): Promise<GenerateGraphqlSdlResult> => {
  const endpoints = collectGraphqlEndpoints(app.getControllers());
  assertUniqueGraphqlEndpointKeys(endpoints);

  const written = await writeGraphqlEndpointModules(endpoints, options);
  const resolverChecks = await generateResolverChecksForSchemaFirstEndpoints(endpoints, options);

  return {
    changed: written.changed || resolverChecks.changed,
    contributions: written.contributions,
    generatedFiles: [...written.generatedFiles, ...resolverChecks.generatedFiles],
  };
};

const toGenerateOptions = (
  cwd: string,
  options: GraphqlPluginOptions,
): GenerateGraphqlSdlOptions => ({
  cwd,
  ...toSdlOptions(options),
});

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const graphqlPlugin = (options: GraphqlPluginOptions = {}): ZeltPlugin<HttpStaticApp> => ({
  name: 'graphql',
  async preBuild(ctx) {
    const app = await ctx.loadStaticApp();
    const { contributions, generatedFiles } = await generateGraphqlSdl(
      app.http,
      toGenerateOptions(ctx.cwd, options),
    );
    for (const file of generatedFiles) ctx.registerGeneratedFile(file);
    return contributions;
  },
});
