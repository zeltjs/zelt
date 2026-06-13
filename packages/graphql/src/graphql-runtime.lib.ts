import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ExecutionResult, GraphQLSchema, ValidationRule } from 'graphql';
import { buildSchema, GraphQLError, GraphQLObjectType, graphql, parse, validate } from 'graphql';
import * as v from 'valibot';

import { GraphqlArgsValidationError, runWithGraphqlArgs } from './gql-validated.lib';
import type { GraphqlResolverClass } from './graphql-metadata.lib';

const generatedGraphqlBindingSchema = v.object({
  resolver: v.string(),
  method: v.string(),
});

const generatedGraphqlRuntimeSchema = v.object({
  schemaSdl: v.string(),
  bindings: v.record(v.string(), v.record(v.string(), generatedGraphqlBindingSchema)),
  enumFields: v.optional(
    v.record(v.string(), v.record(v.string(), v.record(v.string(), v.string()))),
  ),
});

// GraphQL over HTTP clients (Apollo, GraphiQL, ...) commonly send explicit
// nulls for variables/operationName; both mean "not specified".
export const graphqlRequestPayloadSchema = v.object({
  query: v.string(),
  variables: v.nullish(v.record(v.string(), v.unknown())),
  operationName: v.nullish(v.string()),
});

export type GeneratedGraphqlBinding = v.InferOutput<typeof generatedGraphqlBindingSchema>;

export type GeneratedGraphqlRuntime = v.InferOutput<typeof generatedGraphqlRuntimeSchema>;

export type GraphqlRequestPayload = v.InferOutput<typeof graphqlRequestPayloadSchema>;

export type CreateGraphqlExecutorOptions = {
  readonly runtime: GeneratedGraphqlRuntime;
  readonly resolvers: readonly GraphqlResolverClass[];
  readonly resolveResolver: (resolver: GraphqlResolverClass) => object | Promise<object>;
  readonly validationRules?: readonly import('graphql').ValidationRule[];
};

export type ExecuteGraphqlRequestOptions = CreateGraphqlExecutorOptions & {
  readonly request: GraphqlRequestPayload;
};

export type GraphqlExecutor = (request: GraphqlRequestPayload) => Promise<ExecutionResult>;

export type GraphqlRuntimeState = {
  readonly execute: GraphqlExecutor;
};

const runtimeRegistry = new WeakMap<object, GraphqlRuntimeState>();

export const setGraphqlRuntimeState = (controller: object, state: GraphqlRuntimeState): void => {
  runtimeRegistry.set(controller, state);
};

export const getGraphqlRuntimeState = (controller: object): GraphqlRuntimeState | undefined =>
  runtimeRegistry.get(controller);

const toImportSpecifier = (runtimeModule: string): string => {
  if (
    runtimeModule.startsWith('file:') ||
    runtimeModule.startsWith('node:') ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(runtimeModule)
  ) {
    return runtimeModule;
  }
  return pathToFileURL(resolve(runtimeModule)).href;
};

/** @throws {Error} */
export const loadGeneratedGraphqlRuntime = async (
  runtimeModule: string,
): Promise<GeneratedGraphqlRuntime> => {
  const mod: unknown = await import(toImportSpecifier(runtimeModule));
  const parsed = v.safeParse(v.object({ graphqlRuntime: generatedGraphqlRuntimeSchema }), mod);
  if (!parsed.success) {
    throw new Error(`GraphQL runtime module must export graphqlRuntime: ${runtimeModule}`);
  }
  return parsed.output.graphqlRuntime;
};

/** @throws {Error} */
const findResolverClass = (
  resolvers: readonly GraphqlResolverClass[],
  binding: GeneratedGraphqlBinding,
): GraphqlResolverClass => {
  const resolver = resolvers.find((candidate) => candidate.name === binding.resolver);
  if (!resolver) {
    throw new Error(`GraphQL resolver class not found: ${binding.resolver}`);
  }
  return resolver;
};

/** @throws {Error} */
const callResolverMethod = (
  instance: object,
  methodName: string,
  args: readonly unknown[],
): unknown => {
  const method: unknown = Reflect.get(instance, methodName);
  if (typeof method !== 'function') {
    throw new Error(`GraphQL resolver method not found: ${methodName}`);
  }
  return Reflect.apply(method, instance, [...args]);
};

type ResolveBinding = (
  binding: GeneratedGraphqlBinding,
  parent: unknown,
  args: Readonly<Record<string, unknown>>,
  isRootField: boolean,
) => Promise<unknown>;

/** @throws {Error} */
const createBindingResolver = (options: CreateGraphqlExecutorOptions): ResolveBinding => {
  const resolverCache = new Map<GraphqlResolverClass, object>();

  return async (binding, parent, args, isRootField) => {
    const resolverClass = findResolverClass(options.resolvers, binding);
    const cached = resolverCache.get(resolverClass);
    const instance = cached ?? (await options.resolveResolver(resolverClass));
    if (!cached) resolverCache.set(resolverClass, instance);

    return runWithGraphqlArgs(args, () =>
      callResolverMethod(instance, binding.method, isRootField ? [] : [parent]),
    );
  };
};

// Unknown strings fall through unchanged so GraphQL reports the actual
// unrepresentable value instead of an opaque null/undefined error.
const normalizeEnumScalar = (value: unknown, mapping: Readonly<Record<string, string>>): unknown =>
  typeof value === 'string' ? (mapping[value] ?? value) : value;

const normalizeEnumValue = (value: unknown, mapping: Readonly<Record<string, string>>): unknown =>
  Array.isArray(value)
    ? value.map((element: unknown) => normalizeEnumScalar(element, mapping))
    : normalizeEnumScalar(value, mapping);

type BoundFieldResolver = (
  parent: unknown,
  args: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

const createBoundFieldResolver = (
  binding: GeneratedGraphqlBinding,
  isRootField: boolean,
  resolveBinding: ResolveBinding,
  enumMapping: Readonly<Record<string, string>> | undefined,
): BoundFieldResolver => {
  if (!enumMapping) {
    return (parent, args) => resolveBinding(binding, parent, args, isRootField);
  }
  return async (parent, args) =>
    normalizeEnumValue(await resolveBinding(binding, parent, args, isRootField), enumMapping);
};

const attachTypeBindings = (
  type: GraphQLObjectType,
  bindings: Readonly<Record<string, GeneratedGraphqlBinding>>,
  enumFields: Readonly<Record<string, Readonly<Record<string, string>>>>,
  resolveBinding: ResolveBinding,
): void => {
  const graphqlFields = type.getFields();
  const isRootField = type.name === 'Query' || type.name === 'Mutation';
  for (const [fieldName, binding] of Object.entries(bindings)) {
    const field = graphqlFields[fieldName];
    if (!field) continue;
    field.resolve = createBoundFieldResolver(
      binding,
      isRootField,
      resolveBinding,
      enumFields[fieldName],
    );
  }
};

const attachBindingResolvers = (
  schema: GraphQLSchema,
  runtime: GeneratedGraphqlRuntime,
  resolveBinding: ResolveBinding,
): void => {
  for (const [typeName, fields] of Object.entries(runtime.bindings)) {
    const type = schema.getType(typeName);
    if (!(type instanceof GraphQLObjectType)) continue;
    attachTypeBindings(type, fields, runtime.enumFields?.[typeName] ?? {}, resolveBinding);
  }
};

const recordSchema = v.record(v.string(), v.unknown());

const resolveEnumFieldValue = (
  parent: unknown,
  fieldName: string,
  mapping: Readonly<Record<string, string>>,
): unknown => {
  if (!v.is(recordSchema, parent)) return undefined;
  return normalizeEnumValue(parent[fieldName], mapping);
};

const attachEnumFieldResolvers = (
  schema: GraphQLSchema,
  runtime: GeneratedGraphqlRuntime,
): void => {
  for (const [typeName, fields] of Object.entries(runtime.enumFields ?? {})) {
    const type = schema.getType(typeName);
    if (!(type instanceof GraphQLObjectType)) continue;

    const graphqlFields = type.getFields();
    for (const [fieldName, mapping] of Object.entries(fields)) {
      const field = graphqlFields[fieldName];
      if (!field || field.resolve) continue;
      field.resolve = (parent: unknown) => resolveEnumFieldValue(parent, fieldName, mapping);
    }
  }
};

const toValidationGraphqlError = (
  error: GraphQLError,
  original: GraphqlArgsValidationError,
): GraphQLError =>
  new GraphQLError(error.message, {
    nodes: error.nodes ?? null,
    source: error.source ?? null,
    positions: error.positions ?? null,
    path: error.path ?? null,
    originalError: original,
    extensions: { code: 'GRAPHQL_ARGS_VALIDATION_FAILED', issues: original.issues },
  });

const enrichValidationError = (error: GraphQLError): GraphQLError => {
  const original = error.originalError;
  return original instanceof GraphqlArgsValidationError
    ? toValidationGraphqlError(error, original)
    : error;
};

const enrichValidationErrors = (result: ExecutionResult): ExecutionResult => {
  if (!result.errors?.length) return result;
  return { ...result, errors: result.errors.map(enrichValidationError) };
};

// Schema parsing/validation and resolver attachment are static per generated
// runtime, so they run once here instead of on every request.
/** @throws {Error} */
export const createGraphqlExecutor = (options: CreateGraphqlExecutorOptions): GraphqlExecutor => {
  const schema = buildSchema(options.runtime.schemaSdl);
  attachBindingResolvers(schema, options.runtime, createBindingResolver(options));
  attachEnumFieldResolvers(schema, options.runtime);

  const extraRules: readonly ValidationRule[] = options.validationRules ?? [];

  return async (request) => {
    if (extraRules.length > 0) {
      let document: import('graphql').DocumentNode;
      try {
        document = parse(request.query);
      } catch (error) {
        return {
          errors: [error instanceof GraphQLError ? error : new GraphQLError(String(error))],
        };
      }
      const errors = validate(schema, document, [...extraRules]);
      if (errors.length > 0) return { errors };
    }
    return enrichValidationErrors(
      await graphql({
        schema,
        source: request.query,
        variableValues: request.variables ?? undefined,
        operationName: request.operationName ?? undefined,
      }),
    );
  };
};

// Single-shot convenience API: builds the schema on every call. Use
// createGraphqlExecutor() and reuse the executor for repeated execution.
/** @throws {Error} */
export const executeGraphqlRequest = async (
  options: ExecuteGraphqlRequestOptions,
): Promise<ExecutionResult> => createGraphqlExecutor(options)(options.request);
