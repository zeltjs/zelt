import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ZeltDecoratorUsageError } from '@zeltjs/core';
import type {
  ClassMetadata,
  InspectOptions,
  MethodInfo,
  TypeInfo,
} from '@zeltjs/decorator-metadata/inspect';
import { getSourcePosition, getTypeMetadata } from '@zeltjs/decorator-metadata/inspect';

import type { JsonSchema } from './schema-adapter';
import { typeInfoToJsonSchema } from './type-to-schema';

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

const getValidFirstParam = (methodInfo: MethodInfo | undefined): TypeInfo | undefined => {
  if (!methodInfo || methodInfo.params.length === 0) return undefined;
  const firstParam = methodInfo.params[0];
  if (!firstParam || isVoidType(firstParam.type)) return undefined;
  return firstParam.type;
};

const buildRequestBodyFromTypeInfo = (
  controller: ControllerRouteInfo,
  route: RouteInfo,
  methodInfo: MethodInfo | undefined,
  schemas: SchemaMap,
): Operation | undefined => {
  if (isNoBodyMethod(route.method)) return undefined;

  const firstParamType = getValidFirstParam(methodInfo);
  if (!firstParamType) return undefined;

  const { schema } = typeInfoToJsonSchema(firstParamType);
  if (Object.keys(schema).length === 0) return undefined;

  const refName = `${controller.name}_${route.methodName}_Request`;
  schemas[refName] = schema;
  return {
    required: true,
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${refName}` } } },
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

const buildOperation = (
  controller: ControllerRouteInfo,
  route: RouteInfo,
  methodInfo: MethodInfo | undefined,
  schemas: SchemaMap,
): Operation => {
  const op: Operation = {};

  const pathParams = extractPathParams(route.fullPath);
  const params = buildPathParams(pathParams);
  if (params) op['parameters'] = params;

  const reqBody = buildRequestBodyFromTypeInfo(controller, route, methodInfo, schemas);
  if (reqBody) op['requestBody'] = reqBody;

  op['responses'] = buildResponseSchemaFromTypeInfo(controller, route, methodInfo, schemas);

  return op;
};

const buildControllerRoutes = (
  controller: ControllerRouteInfoWithSource,
  typeMetadata: ClassMetadata | undefined,
  schemas: SchemaMap,
  paths: Record<string, PathItem>,
): void => {
  for (const route of controller.routes) {
    const oaPath = toOpenApiPath(route.fullPath);
    const methodInfo = typeMetadata ? findMethodInfo(typeMetadata, route.methodName) : undefined;
    const op = buildOperation(controller, route, methodInfo, schemas);

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
  readonly typeMetadata: ClassMetadata | undefined;
};

/** @throws {ZeltDecoratorUsageError} */
const resolveControllersWithMetadata = async (
  metadata: HttpMetadata,
  controllers: readonly ControllerClass[],
  options: GenerateOpenApiOptions,
): Promise<readonly ControllerWithMeta[]> => {
  const results: ControllerWithMeta[] = [];

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

    const inspectOptions: InspectOptions = options.tsconfig
      ? { tsconfig: options.tsconfig, expandStrategy: 'exported-only' }
      : { expandStrategy: 'exported-only' };
    const typeMetadataResult = await getTypeMetadata(toInspectableClass(cls), inspectOptions);

    const typeMetadata = typeMetadataResult.isOk() ? typeMetadataResult.value : undefined;

    results.push({
      info: { ...info, sourceFile },
      cls,
      typeMetadata,
    });
  }

  return results;
};

const buildOpenApiDoc = async (
  metadata: HttpMetadata,
  controllers: readonly ControllerClass[],
  options: GenerateOpenApiOptions,
): Promise<OpenApiDoc> => {
  const schemas: SchemaMap = {};
  const paths: Record<string, PathItem> = {};

  const controllersWithMeta = await resolveControllersWithMetadata(metadata, controllers, options);
  for (const { info, typeMetadata } of controllersWithMeta) {
    buildControllerRoutes(info, typeMetadata, schemas, paths);
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
