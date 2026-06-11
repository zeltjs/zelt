import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { ZeltPlugin } from '@zeltjs/cli';
import type { ControllerClass, HttpStaticCapabilities } from '@zeltjs/core';
import { getGraphqlControllerMetadata } from './graphql-metadata.lib';
import type { GenerateSdlOptions } from './graphql-sdl-generator.lib';
import { generateGraphqlRuntimeForResolvers } from './graphql-sdl-generator.lib';

type HttpStaticApp = {
  readonly http: Pick<HttpStaticCapabilities, 'getControllers'>;
};

export type GraphqlPluginOptions = {
  readonly outDir?: string;
  readonly tsconfig?: string;
  readonly schemaAdapter?: GenerateSdlOptions['schemaAdapter'];
  readonly schemaResolver?: GenerateSdlOptions['schemaResolver'];
};

export type GenerateGraphqlSdlOptions = GenerateSdlOptions & {
  readonly distDir: string;
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

const buildRuntimeModule = (
  runtime: Awaited<ReturnType<typeof generateGraphqlRuntimeForResolvers>>,
): string => `export const graphqlRuntime = ${JSON.stringify(runtime, null, 2)};\n`;

const writeRuntimeModule = async (
  runtimeModule: string,
  runtime: Awaited<ReturnType<typeof generateGraphqlRuntimeForResolvers>>,
): Promise<boolean> => {
  const runtimePath = resolve(runtimeModule);
  await mkdir(dirname(runtimePath), { recursive: true });
  return writeIfChanged(runtimePath, buildRuntimeModule(runtime));
};

const toRuntimeSchemaPath = (runtimeModule: string): string => {
  const runtimePath = resolve(runtimeModule);
  return runtimePath.replace(/\.(?:cjs|mjs|js|ts)$/, '.graphql');
};

const toSdlOptions = (options: GenerateGraphqlSdlOptions): GenerateSdlOptions => ({
  ...(options.tsconfig !== undefined && { tsconfig: options.tsconfig }),
  ...(options.schemaAdapter !== undefined && { schemaAdapter: options.schemaAdapter }),
  ...(options.schemaResolver !== undefined && { schemaResolver: options.schemaResolver }),
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

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const generateGraphqlSdl = async (
  app: Pick<HttpStaticCapabilities, 'getControllers'>,
  options: GenerateGraphqlSdlOptions,
): Promise<GenerateGraphqlSdlResult> => {
  const distDir = resolve(options.distDir);
  await mkdir(distDir, { recursive: true });

  const endpoints = collectGraphqlEndpoints(app.getControllers());
  const standaloneChanged = await generateStandaloneSchema(endpoints, distDir, options);
  const runtimeChanged = await generateRuntimeModules(endpoints, options);
  return { changed: standaloneChanged || runtimeChanged };
};

const buildGenerateOptions = (options: GraphqlPluginOptions): GenerateGraphqlSdlOptions => ({
  distDir: options.outDir ?? './dist',
  ...(options.tsconfig !== undefined && { tsconfig: options.tsconfig }),
  ...(options.schemaAdapter !== undefined && { schemaAdapter: options.schemaAdapter }),
  ...(options.schemaResolver !== undefined && { schemaResolver: options.schemaResolver }),
});

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const graphqlPlugin = (options: GraphqlPluginOptions = {}): ZeltPlugin<HttpStaticApp> => ({
  name: 'graphql',
  async preBuild(ctx) {
    const app = await ctx.loadStaticApp();
    await generateGraphqlSdl(app.http, buildGenerateOptions(options));
  },
});
