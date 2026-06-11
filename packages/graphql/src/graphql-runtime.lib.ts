import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ExecutionResult, GraphQLSchema } from 'graphql';
import { buildSchema, GraphQLObjectType, graphql } from 'graphql';
import * as v from 'valibot';

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

export const graphqlRequestPayloadSchema = v.object({
  query: v.string(),
  variables: v.optional(v.record(v.string(), v.unknown())),
  operationName: v.optional(v.string()),
});

export type GeneratedGraphqlBinding = v.InferOutput<typeof generatedGraphqlBindingSchema>;

export type GeneratedGraphqlRuntime = v.InferOutput<typeof generatedGraphqlRuntimeSchema>;

export type GraphqlRequestPayload = v.InferOutput<typeof graphqlRequestPayloadSchema>;

export type ExecuteGraphqlRequestOptions = {
  readonly runtime: GeneratedGraphqlRuntime;
  readonly resolvers: readonly GraphqlResolverClass[];
  readonly resolveResolver: (resolver: GraphqlResolverClass) => object | Promise<object>;
  readonly request: GraphqlRequestPayload;
};

export type GraphqlRuntimeState = {
  readonly runtime: GeneratedGraphqlRuntime;
  readonly resolveResolver: (resolver: GraphqlResolverClass) => object | Promise<object>;
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
  isRootField: boolean,
) => Promise<unknown>;

/** @throws {Error} */
const createBindingResolver = (options: ExecuteGraphqlRequestOptions): ResolveBinding => {
  const resolverCache = new Map<GraphqlResolverClass, object>();

  return async (binding, parent, isRootField) => {
    const resolverClass = findResolverClass(options.resolvers, binding);
    const cached = resolverCache.get(resolverClass);
    const instance = cached ?? (await options.resolveResolver(resolverClass));
    if (!cached) resolverCache.set(resolverClass, instance);

    return callResolverMethod(instance, binding.method, isRootField ? [] : [parent]);
  };
};

const attachBindingResolvers = (
  schema: GraphQLSchema,
  runtime: GeneratedGraphqlRuntime,
  resolveBinding: ResolveBinding,
): void => {
  for (const [typeName, fields] of Object.entries(runtime.bindings)) {
    const type = schema.getType(typeName);
    if (!(type instanceof GraphQLObjectType)) continue;

    const graphqlFields = type.getFields();
    for (const [fieldName, binding] of Object.entries(fields)) {
      const field = graphqlFields[fieldName];
      if (!field) continue;
      field.resolve = (parent) =>
        resolveBinding(binding, parent, typeName === 'Query' || typeName === 'Mutation');
    }
  }
};

const recordSchema = v.record(v.string(), v.unknown());

const resolveEnumFieldValue = (
  parent: unknown,
  fieldName: string,
  mapping: Readonly<Record<string, string>>,
): unknown => {
  if (!v.is(recordSchema, parent)) return undefined;
  const value = parent[fieldName];
  return typeof value === 'string' ? mapping[value] : value;
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

/** @throws {Error} */
export const executeGraphqlRequest = async (
  options: ExecuteGraphqlRequestOptions,
): Promise<ExecutionResult> => {
  const schema = buildSchema(options.runtime.schemaSdl);
  attachBindingResolvers(schema, options.runtime, createBindingResolver(options));
  attachEnumFieldResolvers(schema, options.runtime);

  return graphql({
    schema,
    source: options.request.query,
    variableValues: options.request.variables,
    operationName: options.request.operationName,
  });
};
