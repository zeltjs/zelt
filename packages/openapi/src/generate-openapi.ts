import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ZeltDecoratorUsageError } from '@zeltjs/core';
import { getSourcePosition } from '@zeltjs/decorator-metadata/inspect';
import type { Config } from 'ts-json-schema-generator';
import { createGenerator } from 'ts-json-schema-generator';

export type RouteInfo = {
  readonly method: string;
  readonly path: string;
  readonly fullPath: string;
  readonly methodName: string;
};

export type ControllerClass = new (...args: never[]) => object;

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

type SchemaMap = Record<string, unknown>;
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

const createSchemaGenerator = (tsconfigPath: string, typeName: string): unknown => {
  const config: Config = {
    tsconfig: tsconfigPath,
    type: typeName,
    skipTypeCheck: true,
    topRef: false,
  };
  const generator = createGenerator(config);
  return generator.createSchema(typeName);
};

const toSchemaObject = (schema: unknown): Record<string, unknown> | undefined => {
  if (typeof schema !== 'object' || schema === null) return undefined;
  const obj: Record<string, unknown> = { ...schema };
  return obj;
};

const isUndefinedSchema = (schemaObj: Record<string, unknown>): boolean =>
  schemaObj['type'] === 'undefined' || schemaObj['$ref'] === '#/definitions/undefined';

const tryGenerateSchema = (
  tsconfigPath: string,
  typeName: string,
): Record<string, unknown> | undefined => {
  try {
    const schema = createSchemaGenerator(tsconfigPath, typeName);
    return toSchemaObject(schema);
  } catch {
    return undefined;
  }
};

const buildRequestBody = (
  controller: ControllerRouteInfo,
  route: RouteInfo,
  tsconfigPath: string,
  schemas: SchemaMap,
): Operation | undefined => {
  if (route.method === 'GET' || route.method === 'DELETE') return undefined;

  const typeName = `Parameters<typeof ${controller.name}.prototype.${route.methodName}>[0]`;
  const schemaObj = tryGenerateSchema(tsconfigPath, typeName);

  if (!schemaObj || isUndefinedSchema(schemaObj)) return undefined;

  const refName = `${controller.name}_${route.methodName}_Request`;
  schemas[refName] = schemaObj;
  return {
    required: true,
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${refName}` } } },
  };
};

const buildResponseSchema = (
  controller: ControllerRouteInfo,
  route: RouteInfo,
  tsconfigPath: string,
  schemas: SchemaMap,
): Record<string, unknown> => {
  const typeName = `Awaited<ReturnType<typeof ${controller.name}.prototype.${route.methodName}>>`;
  const schemaObj = tryGenerateSchema(tsconfigPath, typeName);

  if (!schemaObj) return { '200': { description: 'OK' } };

  const refName = `${controller.name}_${route.methodName}_Response`;
  schemas[refName] = schemaObj;
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
  tsconfigPath: string,
  schemas: SchemaMap,
): Operation => {
  const op: Operation = {};

  const pathParams = extractPathParams(route.fullPath);
  const params = buildPathParams(pathParams);
  if (params) op['parameters'] = params;

  const reqBody = buildRequestBody(controller, route, tsconfigPath, schemas);
  if (reqBody) op['requestBody'] = reqBody;

  op['responses'] = buildResponseSchema(controller, route, tsconfigPath, schemas);

  return op;
};

const buildControllerRoutes = (
  controller: ControllerRouteInfoWithSource,
  tsconfigPath: string,
  schemas: SchemaMap,
  paths: Record<string, PathItem>,
): void => {
  for (const route of controller.routes) {
    const oaPath = toOpenApiPath(route.fullPath);
    const op = buildOperation(controller, route, tsconfigPath, schemas);

    const existing = paths[oaPath] ?? {};
    existing[route.method.toLowerCase()] = op;
    paths[oaPath] = existing;
  }
};

const findControllerClass = (
  controllers: readonly ControllerClass[],
  name: string,
): ControllerClass | undefined => controllers.find((cls) => cls.name === name);

/** @throws {ZeltDecoratorUsageError} */
const resolveControllersWithSource = (
  metadata: HttpMetadata,
  controllers: readonly ControllerClass[],
): readonly ControllerRouteInfoWithSource[] =>
  metadata.controllers.map((info) => {
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
    return { ...info, sourceFile };
  });

/** @throws {ZeltDecoratorUsageError} */
const buildOpenApiDoc = (
  metadata: HttpMetadata,
  controllers: readonly ControllerClass[],
  options: GenerateOpenApiOptions,
): OpenApiDoc => {
  const tsconfigPath = options.tsconfig ?? resolve('tsconfig.json');
  const schemas: SchemaMap = {};
  const paths: Record<string, PathItem> = {};

  const controllersWithSource = resolveControllersWithSource(metadata, controllers);
  for (const controller of controllersWithSource) {
    buildControllerRoutes(controller, tsconfigPath, schemas, paths);
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

/** @throws {ZeltDecoratorUsageError} */
export const generateOpenApi = async (
  app: HttpAppLike,
  options: GenerateOpenApiOptions,
): Promise<GenerateOpenApiResult> => {
  const distDir = resolve(options.distDir);
  await mkdir(distDir, { recursive: true });

  const metadata = app.getMetadata();
  const controllers = app.getControllers();
  const openApiDoc = buildOpenApiDoc(metadata, controllers, options);

  const openApiContent = `${JSON.stringify(openApiDoc, null, 2)}\n`;
  const openApiPath = resolve(distDir, 'openapi.json');

  const changed = await writeIfChanged(openApiPath, openApiContent);

  return { changed };
};
