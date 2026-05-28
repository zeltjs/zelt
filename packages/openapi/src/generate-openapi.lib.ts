import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ZeltDecoratorUsageError } from '@zeltjs/core';
import type {
  ClassMetadata,
  InspectOptions,
  MethodInfo,
  ParamInfo,
  TypeInfo,
} from '@zeltjs/decorator-metadata/inspect';
import {
  getOrCreateProgram,
  getSourcePosition,
  getTypeMetadata,
} from '@zeltjs/decorator-metadata/inspect';

import type { RequestSchemaRef, ValidationTarget } from './analyze-handler.lib';
import { analyzeParamFromPosition } from './analyze-handler.lib';
import type { SchemaResolver } from './resolve-schema.lib';
import { resolveValidatedSchema } from './resolve-schema.lib';
import type { JsonSchema, SchemaAdapter } from './schema.types';
import { typeInfoToJsonSchema } from './type-to-schema.lib';

type TSProgram = import('typescript').Program;
type TypeScriptModule = typeof import('typescript');

export type RouteInfo = {
  readonly method: string;
  readonly path: string;
  readonly fullPath: string;
  readonly methodName: string;
};

export type ControllerClass = new (...args: never[]) => object;

type InspectableClass = new (...args: unknown[]) => object;

function toInspectableClass(cls: ControllerClass): InspectableClass;
function toInspectableClass(cls: ControllerClass): unknown {
  return cls;
}

export type ControllerRouteInfo = {
  readonly basePath: string;
  readonly name: string;
  readonly routes: readonly RouteInfo[];
};

type ControllerRouteInfoWithSource = ControllerRouteInfo & { readonly sourceFile: string };

export type HttpMetadata = {
  readonly controllers: readonly ControllerRouteInfo[];
};

type HttpAppLike = {
  getMetadata: () => HttpMetadata;
  getControllers: () => readonly ControllerClass[];
};

export type GenerateOpenApiOptions = {
  readonly distDir: string;
  readonly tsconfig?: string;
  readonly title?: string;
  readonly version?: string;
  readonly schemaAdapter?: SchemaAdapter;
  readonly schemaResolver?: SchemaResolver;
};

export type GenerateOpenApiResult = {
  readonly changed: boolean;
};

type SchemaMap = Record<string, JsonSchema>;
type Operation = Record<string, unknown>;
type PathItem = Record<string, Operation>;

type OpenApiDoc = {
  openapi: '3.1.0';
  readonly info: { readonly title: string; readonly version: string };
  readonly paths: Readonly<Record<string, PathItem>>;
  readonly components: { readonly schemas: Readonly<SchemaMap> };
};

const toOpenApiPath = (p: string): string => p.replace(/:(\w+)/g, '{$1}');

const extractPathParams = (path: string): string[] => {
  const matches = path.match(/:(\w+)/g);
  return matches ? matches.map((m) => m.slice(1)) : [];
};

const buildPathParams = (
  pathParams: readonly string[],
): readonly Record<string, unknown>[] | undefined => {
  if (pathParams.length === 0) return undefined;
  return pathParams.map((name) => ({
    in: 'path',
    name,
    required: true,
    schema: { type: 'string' },
  }));
};

const isVoidType = (type: TypeInfo): boolean =>
  type.kind === 'primitive' && type.type === 'undefined';

const findMethodInfo = (metadata: ClassMetadata, methodName: string): MethodInfo | undefined =>
  metadata.methods.find((m) => m.name === methodName);

const isNoBodyMethod = (method: string): boolean => method === 'GET' || method === 'DELETE';

const targetToContentType = (target: ValidationTarget): string =>
  target === 'form' ? 'multipart/form-data' : 'application/json';

const resolveRequestSchemaRef = (
  methodInfo: MethodInfo | undefined,
  program: TSProgram,
  ts: TypeScriptModule,
): RequestSchemaRef => {
  if (!methodInfo) return { kind: 'none' };
  for (const param of methodInfo.params) {
    const ref = analyzeParamFromMaybePos(param, program, ts);
    if (ref.kind !== 'none') return ref;
  }
  return { kind: 'none' };
};

const analyzeParamFromMaybePos = (
  param: ParamInfo,
  program: TSProgram,
  ts: TypeScriptModule,
): RequestSchemaRef => {
  if (!param.pos) return { kind: 'none' };
  return analyzeParamFromPosition(program, ts, param.pos);
};

/** @throws {Error} */
const buildRequestBody = async (
  controller: ControllerRouteInfo,
  route: RouteInfo,
  ref: RequestSchemaRef,
  schemas: SchemaMap,
  schemaAdapter: SchemaAdapter | undefined,
  schemaResolver: SchemaResolver | undefined,
): Promise<Operation | undefined> => {
  if (isNoBodyMethod(route.method)) return undefined;
  if (ref.kind === 'none') return undefined;
  if (!schemaAdapter) {
    throw new Error(
      `Controller ${controller.name}.${route.methodName} uses validated() but no schemaAdapter was provided to generateOpenApi`,
    );
  }

  const schema = await resolveValidatedSchema(
    ref.modulePath,
    ref.exportName,
    schemaAdapter,
    schemaResolver,
  );

  const refName = `${controller.name}_${route.methodName}_Request`;
  schemas[refName] = schema;
  return {
    required: true,
    content: {
      [targetToContentType(ref.target)]: { schema: { $ref: `#/components/schemas/${refName}` } },
    },
  };
};

const buildResponseSchemaFromTypeInfo = (
  controller: ControllerRouteInfo,
  route: RouteInfo,
  methodInfo: MethodInfo | undefined,
  schemas: SchemaMap,
): Record<string, unknown> => {
  if (!methodInfo || isVoidType(methodInfo.returnType)) {
    return { '200': { description: 'OK' } };
  }

  const { schema } = typeInfoToJsonSchema(methodInfo.returnType);
  if (Object.keys(schema).length === 0) {
    return { '200': { description: 'OK' } };
  }

  const refName = `${controller.name}_${route.methodName}_Response`;
  schemas[refName] = schema;
  return {
    '200': {
      description: 'OK',
      content: { 'application/json': { schema: { $ref: `#/components/schemas/${refName}` } } },
    },
  };
};

type SchemaContext = {
  readonly program: TSProgram;
  readonly ts: TypeScriptModule;
  readonly schemaAdapter: SchemaAdapter | undefined;
  readonly schemaResolver: SchemaResolver | undefined;
};

/** @throws {Error} */
const buildOperation = async (
  controller: ControllerRouteInfo,
  route: RouteInfo,
  methodInfo: MethodInfo | undefined,
  ctx: SchemaContext,
  schemas: SchemaMap,
): Promise<Operation> => {
  const op: Operation = {};

  const pathParams = extractPathParams(route.fullPath);
  const params = buildPathParams(pathParams);
  if (params) op['parameters'] = params;

  const ref = resolveRequestSchemaRef(methodInfo, ctx.program, ctx.ts);
  const reqBody = await buildRequestBody(
    controller,
    route,
    ref,
    schemas,
    ctx.schemaAdapter,
    ctx.schemaResolver,
  );
  if (reqBody) op['requestBody'] = reqBody;

  op['responses'] = buildResponseSchemaFromTypeInfo(controller, route, methodInfo, schemas);

  return op;
};

/** @throws {Error} */
const buildControllerRoutes = async (
  controller: ControllerRouteInfoWithSource,
  typeMetadata: ClassMetadata,
  ctx: SchemaContext,
  schemas: SchemaMap,
  paths: Record<string, PathItem>,
): Promise<void> => {
  for (const route of controller.routes) {
    const oaPath = toOpenApiPath(route.fullPath);
    const methodInfo = findMethodInfo(typeMetadata, route.methodName);
    const op = await buildOperation(controller, route, methodInfo, ctx, schemas);

    const existing = paths[oaPath] ?? {};
    existing[route.method.toLowerCase()] = op;
    paths[oaPath] = existing;
  }
};

const findControllerClass = (
  controllers: readonly ControllerClass[],
  name: string,
): ControllerClass | undefined => controllers.find((cls) => cls.name === name);

type ControllerWithMeta = {
  readonly info: ControllerRouteInfoWithSource;
  readonly cls: ControllerClass;
  readonly typeMetadata: ClassMetadata;
};

const buildInspectOptions = (options: GenerateOpenApiOptions): InspectOptions =>
  options.tsconfig
    ? { tsconfig: options.tsconfig, expandStrategy: 'always' }
    : { expandStrategy: 'always' };

/** @throws {ZeltDecoratorUsageError | UnsupportedTypeScriptVersionError} */
const resolveControllersWithMetadata = async (
  metadata: HttpMetadata,
  controllers: readonly ControllerClass[],
  options: GenerateOpenApiOptions,
): Promise<readonly ControllerWithMeta[]> => {
  const results: ControllerWithMeta[] = [];
  const inspectOptions = buildInspectOptions(options);

  for (const info of metadata.controllers) {
    const cls = findControllerClass(controllers, info.name);
    if (!cls) {
      throw new ZeltDecoratorUsageError({
        decoratorName: 'Controller',
        reason: 'missing_decorator',
        targetName: info.name,
      });
    }

    const sourceFile = getSourcePosition(cls)?.sourceFile;
    if (!sourceFile) {
      throw new ZeltDecoratorUsageError({
        decoratorName: 'Controller',
        reason: 'missing_decorator',
        targetName: info.name,
      });
    }

    const typeMetadataResult = await getTypeMetadata(toInspectableClass(cls), inspectOptions);
    if (typeMetadataResult.isErr()) {
      const err = typeMetadataResult.error;
      throw new ZeltDecoratorUsageError({
        decoratorName: 'Controller',
        reason: 'missing_decorator',
        targetName: `${info.name}: failed to get type metadata (${err.code}: ${err.message})`,
      });
    }

    results.push({
      info: { ...info, sourceFile },
      cls,
      typeMetadata: typeMetadataResult.value,
    });
  }

  return results;
};

/** @throws {ZeltDecoratorUsageError | UnsupportedTypeScriptVersionError | Error} */
const buildOpenApiDoc = async (
  metadata: HttpMetadata,
  controllers: readonly ControllerClass[],
  options: GenerateOpenApiOptions,
): Promise<OpenApiDoc> => {
  const schemas: SchemaMap = {};
  const paths: Record<string, PathItem> = {};

  const tsconfigPath = resolve(options.tsconfig ?? 'tsconfig.json');
  const programResult = await getOrCreateProgram(tsconfigPath);
  if (programResult.isErr()) {
    throw new Error(`Failed to load TypeScript program: ${programResult.error.message}`);
  }
  const { program, ts } = programResult.value;
  const ctx: SchemaContext = {
    program,
    ts,
    schemaAdapter: options.schemaAdapter,
    schemaResolver: options.schemaResolver,
  };

  const controllersWithMeta = await resolveControllersWithMetadata(metadata, controllers, options);
  for (const { info, typeMetadata } of controllersWithMeta) {
    await buildControllerRoutes(info, typeMetadata, ctx, schemas, paths);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: options.title ?? 'Zelt API',
      version: options.version ?? '0.0.0',
    },
    paths,
    components: { schemas },
  };
};

const writeIfChanged = async (path: string, content: string): Promise<boolean> => {
  if (existsSync(path)) {
    const existing = await readFile(path, 'utf8');
    if (existing === content) return false;
  }
  await writeFile(path, content, 'utf8');
  return true;
};

/** @throws {ZeltDecoratorUsageError | UnsupportedTypeScriptVersionError | Error} */
export const generateOpenApi = async (
  app: HttpAppLike,
  options: GenerateOpenApiOptions,
): Promise<GenerateOpenApiResult> => {
  const distDir = resolve(options.distDir);
  await mkdir(distDir, { recursive: true });

  const metadata = app.getMetadata();
  const controllers = app.getControllers();
  const openApiDoc = await buildOpenApiDoc(metadata, controllers, options);

  const openApiContent = `${JSON.stringify(openApiDoc, null, 2)}\n`;
  const openApiPath = resolve(distDir, 'openapi.json');

  const changed = await writeIfChanged(openApiPath, openApiContent);

  return { changed };
};
