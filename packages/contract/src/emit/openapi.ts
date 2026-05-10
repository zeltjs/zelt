// packages/contract/src/emit/openapi.ts
import { okAsync, errAsync, type ResultAsync } from 'neverthrow';

import type { ContractError } from '../errors';
import type { RequestSchemaRef } from '../analyzer/handler';
import type { ControllerIR, RouteIR } from '../analyzer/internal-representation';
import type { SchemaAdapter } from '../types/schema-adapter';

import { resolveRequestSchema, type RequestSchemaJson } from './json-schema-input';
import { resolveResponseSchema, type ResponseSchemaJson } from './json-schema-output';
import { validationErrorBodyJsonSchema } from './validation-error-schema';

type EmitOpenApiOptions = {
  readonly distDir: string;
  readonly tsconfigPath: string;
  readonly requestValidator?: SchemaAdapter;
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

const targetToContentType = (target: 'json' | 'form'): string =>
  target === 'form' ? 'multipart/form-data' : 'application/json';

const buildRequestBody = (req: RequestSchemaJson, schemas: SchemaMap): Operation | undefined => {
  if (req.kind === 'none') return undefined;
  const contentType = targetToContentType(req.target);
  if (req.kind === 'ref') {
    schemas[req.name] = req.schema;
    return { required: true, content: { [contentType]: { schema: refTo(req.name) } } };
  }
  return { required: true, content: { [contentType]: { schema: req.schema } } };
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

const hasValidatedRequest = (req: RequestSchemaRef): boolean =>
  req.kind === 'valibot-named' || req.kind === 'valibot-inline';

const hasAnyValidatedRoute = (controllers: readonly ControllerIR[]): boolean =>
  controllers.some((c) => c.routes.some((r) => hasValidatedRequest(r.requestSchema)));

const resolveRequestSchemaWithAdapter = (
  ref: RequestSchemaRef,
  adapter: SchemaAdapter | undefined,
): ResultAsync<RequestSchemaJson, ContractError> => {
  if (ref.kind === 'none') return okAsync({ kind: 'none' });
  if (!adapter) {
    return errAsync({ type: 'REQUEST_VALIDATOR_REQUIRED' as const });
  }
  return resolveRequestSchema(ref, adapter);
};

const validationFailedResponse = (): Record<string, unknown> => ({
  description: 'validation failed',
  content: { 'application/json': { schema: refTo('ValidationErrorBody') } },
});

const buildOperation = (
  r: RouteIR,
  schemas: SchemaMap,
  options: EmitOpenApiOptions,
): ResultAsync<Operation, ContractError> => {
  return resolveRequestSchemaWithAdapter(r.requestSchema, options.requestValidator).andThen(
    (reqJson) => {
      const respResult = resolveResponseSchema(r.responseType, {
        tsconfigPath: options.tsconfigPath,
      });
      if (respResult.isErr()) {
        return errAsync(respResult.error);
      }
      const respJson = respResult.value;

      const op: Operation = {};
      const reqBody = buildRequestBody(reqJson, schemas);
      if (reqBody) op['requestBody'] = reqBody;

      const params = buildPathParams(r.pathParams);
      if (params) op['parameters'] = params;

      const responses: Record<string, unknown> = {};
      const respEntry = buildResponseEntry(respJson, schemas);
      if (respEntry) responses[respEntry.status] = respEntry.value;
      if (hasValidatedRequest(r.requestSchema)) responses['400'] = validationFailedResponse();
      op['responses'] = responses;

      return okAsync(op);
    },
  );
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

export const emitOpenApi = (
  controllers: readonly ControllerIR[],
  options: EmitOpenApiOptions,
): ResultAsync<OpenApiDoc, ContractError> => {
  const schemas: SchemaMap = {};
  const paths: Record<string, PathItem> = {};

  if (hasAnyValidatedRoute(controllers)) {
    schemas['ValidationErrorBody'] = validationErrorBodyJsonSchema;
  }

  const buildAllOperations = (): ResultAsync<void, ContractError> => {
    let chain: ResultAsync<void, ContractError> = okAsync(undefined);

    for (const c of controllers) {
      for (const r of c.routes) {
        chain = chain.andThen(() =>
          buildOperation(r, schemas, options).map((op) => {
            addOperation(paths, toOpenApiPath(r.fullPath), r.method, op);
            return undefined;
          }),
        );
      }
    }

    return chain;
  };

  return buildAllOperations().map(() => ({
    openapi: '3.1.0' as const,
    info: { title: 'zelt app', version: '0.0.0' },
    paths,
    components: { schemas },
  }));
};
