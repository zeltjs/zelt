import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ZeltPlugin } from '@zeltjs/cli';
import type { ControllerClass, HttpStaticCapabilities } from '@zeltjs/core';
import { getGraphqlControllerMetadata } from './graphql-metadata.lib';
import type { GraphqlRuntimeManifest } from './graphql-runtime.lib';
import type { GenerateSdlOptions } from './graphql-sdl-generator.lib';
import { generateGraphqlRuntimeForResolvers } from './graphql-sdl-generator.lib';
import { generateSchemaFirstGraphqlRuntimeForResolvers } from './schema-first-runtime.lib';

type HttpStaticApp = {
  readonly http: Pick<HttpStaticCapabilities, 'getControllers'>;
};

export type GraphqlPluginOptions = {
  readonly mode?: 'code-first' | 'schema-first';
  readonly outDir?: string;
  readonly schema?: string;
  readonly runtimeModule?: string;
  readonly tsconfig?: string;
  readonly schemaAdapter?: GenerateSdlOptions['schemaAdapter'];
  readonly schemaResolver?: GenerateSdlOptions['schemaResolver'];
  readonly scalarResolver?: GenerateSdlOptions['scalarResolver'];
};

export type GenerateGraphqlSdlOptions = GenerateSdlOptions & {
  readonly distDir: string;
  readonly mode?: 'code-first' | 'schema-first';
  readonly schema?: string;
  readonly runtimeModule?: string;
};

export type GenerateGraphqlSdlResult = {
  readonly changed: boolean;
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
  readonly resolvers: readonly NonNullable<
    ReturnType<typeof getGraphqlControllerMetadata>
  >['resolvers'][number][];
  readonly runtimeModule: string | undefined;
};

const collectGraphqlEndpoints = (
  controllers: readonly ControllerClass[],
): readonly GraphqlEndpoint[] => {
  const endpoints: GraphqlEndpoint[] = [];
  for (const controller of controllers) {
    const metadata = getGraphqlControllerMetadata(controller);
    if (!metadata) continue;
    endpoints.push({
      resolvers: metadata.resolvers,
      runtimeModule: metadata.runtimeModule,
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

const toSerializableRuntime = (runtime: GraphqlRuntimeManifest): GraphqlRuntimeManifest => ({
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

const buildRuntimeModule = (runtime: GraphqlRuntimeManifest): string => {
  const imports = buildScalarImports(runtime);
  const runtimeJson = JSON.stringify(toSerializableRuntime(runtime), null, 2);
  const scalarLiteral = buildScalarObjectLiteral(runtime);
  if (!scalarLiteral) return `${imports}export const graphqlRuntime = ${runtimeJson};\n`;
  const trimmed = runtimeJson.replace(/\n}$/, '');
  return `${imports}export const graphqlRuntime = ${trimmed},\n${scalarLiteral}\n};\n`;
};

const writeRuntimeModule = async (
  runtimeModule: string,
  runtime: GraphqlRuntimeManifest,
): Promise<boolean> => {
  const runtimePath = resolve(runtimeModule);
  await mkdir(dirname(runtimePath), { recursive: true });
  return writeIfChanged(runtimePath, buildRuntimeModule(runtime));
};

const toRuntimeSchemaPath = (runtimeModule: string): string => {
  const runtimePath = resolve(runtimeModule);
  const replaced = runtimePath.replace(/\.(?:cjs|mjs|js|ts)$/, '.graphql');
  return replaced === runtimePath ? `${runtimePath}.graphql` : replaced;
};

const toSdlOptions = (options: GenerateGraphqlSdlOptions): GenerateSdlOptions => ({
  ...(options.tsconfig !== undefined && { tsconfig: options.tsconfig }),
  ...(options.schemaAdapter !== undefined && { schemaAdapter: options.schemaAdapter }),
  ...(options.schemaResolver !== undefined && { schemaResolver: options.schemaResolver }),
  ...(options.scalarResolver !== undefined && { scalarResolver: options.scalarResolver }),
});

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const generateStandaloneSchema = async (
  endpoints: readonly GraphqlEndpoint[],
  distDir: string,
  options: GenerateGraphqlSdlOptions,
): Promise<boolean> => {
  const standaloneResolvers = endpoints
    .filter((endpoint) => !endpoint.runtimeModule)
    .flatMap((endpoint) => endpoint.resolvers);
  if (standaloneResolvers.length === 0) return false;

  const standaloneRuntime = await generateGraphqlRuntimeForResolvers(
    standaloneResolvers,
    toSdlOptions(options),
  );
  return writeIfChanged(resolve(distDir, 'schema.graphql'), standaloneRuntime.schemaSdl);
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const generateRuntimeModules = async (
  endpoints: readonly GraphqlEndpoint[],
  options: GenerateGraphqlSdlOptions,
): Promise<boolean> => {
  let changed = false;
  for (const endpoint of endpoints) {
    if (!endpoint.runtimeModule) continue;
    const runtime = await generateGraphqlRuntimeForResolvers(
      endpoint.resolvers,
      toSdlOptions(options),
    );
    changed = (await writeRuntimeModule(endpoint.runtimeModule, runtime)) || changed;
    changed =
      (await writeIfChanged(toRuntimeSchemaPath(endpoint.runtimeModule), runtime.schemaSdl)) ||
      changed;
  }
  return changed;
};

/** @throws {Error} */
const resolveSchemaFirstRuntimeModule = (
  endpoints: readonly GraphqlEndpoint[],
  options: GenerateGraphqlSdlOptions,
): string => {
  if (options.runtimeModule) return options.runtimeModule;
  const runtimeModules = endpoints.flatMap((endpoint) =>
    endpoint.runtimeModule ? [endpoint.runtimeModule] : [],
  );
  const first = runtimeModules[0];
  if (!first) {
    throw new Error('schema-first graphqlPlugin requires runtimeModule.');
  }
  if (runtimeModules.length > 1) {
    throw new Error(
      'schema-first graphqlPlugin requires runtimeModule when multiple endpoints exist.',
    );
  }
  return first;
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const generateSchemaFirstRuntimeModule = async (
  endpoints: readonly GraphqlEndpoint[],
  options: GenerateGraphqlSdlOptions,
): Promise<boolean> => {
  if (!options.schema) {
    throw new Error('schema-first graphqlPlugin requires schema.');
  }
  const runtimeModule = resolveSchemaFirstRuntimeModule(endpoints, options);
  const schemaSdl = await readFile(resolve(options.schema), 'utf8');
  const runtime = await generateSchemaFirstGraphqlRuntimeForResolvers(
    endpoints.flatMap((endpoint) => endpoint.resolvers),
    {
      schemaSdl,
      ...(options.tsconfig !== undefined && { tsconfig: options.tsconfig }),
    },
  );
  const runtimeChanged = await writeRuntimeModule(runtimeModule, runtime);
  const schemaChanged = await writeIfChanged(toRuntimeSchemaPath(runtimeModule), schemaSdl);
  return runtimeChanged || schemaChanged;
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const generateGraphqlSdl = async (
  app: Pick<HttpStaticCapabilities, 'getControllers'>,
  options: GenerateGraphqlSdlOptions,
): Promise<GenerateGraphqlSdlResult> => {
  const distDir = resolve(options.distDir);
  await mkdir(distDir, { recursive: true });

  const endpoints = collectGraphqlEndpoints(app.getControllers());
  if (options.mode === 'schema-first' || options.schema !== undefined) {
    return { changed: await generateSchemaFirstRuntimeModule(endpoints, options) };
  }
  const standaloneChanged = await generateStandaloneSchema(endpoints, distDir, options);
  const runtimeChanged = await generateRuntimeModules(endpoints, options);
  return { changed: standaloneChanged || runtimeChanged };
};

type WritableGenerateGraphqlSdlOptions = {
  -readonly [Key in keyof GenerateGraphqlSdlOptions]: GenerateGraphqlSdlOptions[Key];
};

const addSchemaFirstOptions = (
  generateOptions: WritableGenerateGraphqlSdlOptions,
  options: GraphqlPluginOptions,
): void => {
  if (options.mode !== undefined) generateOptions.mode = options.mode;
  if (options.schema !== undefined) generateOptions.schema = options.schema;
  if (options.runtimeModule !== undefined) generateOptions.runtimeModule = options.runtimeModule;
};

const addCodeFirstOptions = (
  generateOptions: WritableGenerateGraphqlSdlOptions,
  options: GraphqlPluginOptions,
): void => {
  if (options.tsconfig !== undefined) generateOptions.tsconfig = options.tsconfig;
  if (options.schemaAdapter !== undefined) generateOptions.schemaAdapter = options.schemaAdapter;
  if (options.schemaResolver !== undefined) generateOptions.schemaResolver = options.schemaResolver;
  if (options.scalarResolver !== undefined) generateOptions.scalarResolver = options.scalarResolver;
};

const addGenerateOptions = (
  generateOptions: WritableGenerateGraphqlSdlOptions,
  options: GraphqlPluginOptions,
): void => {
  addSchemaFirstOptions(generateOptions, options);
  addCodeFirstOptions(generateOptions, options);
};

const buildGenerateOptions = (options: GraphqlPluginOptions): GenerateGraphqlSdlOptions => {
  const generateOptions: WritableGenerateGraphqlSdlOptions = {
    distDir: options.outDir ?? './dist',
  };
  addGenerateOptions(generateOptions, options);
  return generateOptions;
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const graphqlPlugin = (options: GraphqlPluginOptions = {}): ZeltPlugin<HttpStaticApp> => ({
  name: 'graphql',
  async preBuild(ctx) {
    const app = await ctx.loadStaticApp();
    await generateGraphqlSdl(app.http, buildGenerateOptions(options));
  },
});
