import { validationErrorBodySchema } from '@zeltjs/core';
import { toJsonSchema } from '@valibot/to-json-schema';

import type { RequestSchemaRef } from '../analyzer/handler';
import type { ControllerIR, RouteIR } from '../analyzer/internal-representation';

import { resolveRequestSchema, type RequestSchemaJson } from './json-schema-input';
import { resolveResponseSchema, type ResponseSchemaJson } from './json-schema-output';

type EmitOpenApiOptions = {
  readonly distDir: string;
  readonly tsconfigPath: string;
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

const refTo = (name: string): { $ref: string } => ({
  $ref: `#/components/schemas/${name}`,
});

const buildRequestBody = (req: RequestSchemaJson, schemas: SchemaMap): Operation | undefined => {
  if (req.kind === 'none') return undefined;
  if (req.kind === 'ref') {
    schemas[req.name] = req.schema;
    return { required: true, content: { 'application/json': { schema: refTo(req.name) } } };
  }
  return { required: true, content: { 'application/json': { schema: req.schema } } };
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

const buildResponseEntry = (
  resp: ResponseSchemaJson,
  schemas: SchemaMap,
): { status: string; value: Record<string, unknown> } | undefined => {
  if (resp.kind === 'omit') return undefined;
  if (resp.kind === 'ref') {
    schemas[resp.name] = resp.schema;
    return {
      status: String(resp.status),
      value: { description: '', content: { [resp.contentType]: { schema: refTo(resp.name) } } },
    };
  }
  return {
    status: String(resp.status),
    value: { description: '', content: { [resp.contentType]: { schema: resp.schema } } },
  };
};

const hasValibotRequest = (req: RequestSchemaRef): boolean =>
  req.kind === 'valibot-named' || req.kind === 'valibot-inline';

const validationFailedResponse = (): Record<string, unknown> => ({
  description: 'validation failed',
  content: { 'application/json': { schema: refTo('ValidationErrorBody') } },
});

const buildOperation = async (
  r: RouteIR,
  schemas: SchemaMap,
  options: EmitOpenApiOptions,
): Promise<Operation> => {
  const op: Operation = {};
  const reqJson = await resolveRequestSchema(r.requestSchema);
  const reqBody = buildRequestBody(reqJson, schemas);
  if (reqBody) op['requestBody'] = reqBody;

  const params = buildPathParams(r.pathParams);
  if (params) op['parameters'] = params;

  const respJson = resolveResponseSchema(r.responseType, { tsconfigPath: options.tsconfigPath });
  const responses: Record<string, unknown> = {};
  const respEntry = buildResponseEntry(respJson, schemas);
  if (respEntry) responses[respEntry.status] = respEntry.value;
  if (hasValibotRequest(r.requestSchema)) responses['400'] = validationFailedResponse();
  op['responses'] = responses;

  return op;
};

const addOperation = (
  paths: Record<string, PathItem>,
  oaPath: string,
  method: string,
  op: Operation,
): void => {
  const existing = paths[oaPath] ?? {};
  existing[method.toLowerCase()] = op;
  paths[oaPath] = existing;
};

export const emitOpenApi = async (
  controllers: readonly ControllerIR[],
  options: EmitOpenApiOptions,
): Promise<OpenApiDoc> => {
  const schemas: SchemaMap = {};
  const paths: Record<string, PathItem> = {};

  // ValidationErrorBody は validated() を持つ任意の route から参照されるため一度だけ global 登録する。
  schemas['ValidationErrorBody'] = toJsonSchema(validationErrorBodySchema);

  for (const c of controllers) {
    for (const r of c.routes) {
      const op = await buildOperation(r, schemas, options);
      addOperation(paths, toOpenApiPath(r.fullPath), r.method, op);
    }
  }

  return {
    openapi: '3.1.0',
    info: { title: 'zelt app', version: '0.0.0' },
    paths,
    components: { schemas },
  };
};
