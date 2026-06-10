import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ExecutionResult } from 'graphql';
import { buildSchema, graphql as executeGraphql, GraphQLObjectType } from 'graphql';

import type { GraphqlResolverClass } from './graphql.metadata';

export type GeneratedGraphqlBinding = {
  readonly resolver: string;
  readonly method: string;
};

export type GeneratedGraphqlRuntime = {
  readonly schemaSdl: string;
  readonly bindings: Readonly<Record<string, Readonly<Record<string, GeneratedGraphqlBinding>>>>;
  readonly enumFields?: Readonly<
    Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>
  >;
};

export type GraphqlRequestPayload = {
  readonly query: string;
  readonly variables?: Readonly<Record<string, unknown>>;
  readonly operationName?: string;
};

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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isGraphqlRequestPayload = (value: unknown): value is GraphqlRequestPayload => {
  if (!isObject(value)) return false;
  if (typeof value['query'] !== 'string') return false;
  const variables = value['variables'];
  return variables === undefined || isObject(variables);
};

export const setGraphqlRuntimeState = (controller: object, state: GraphqlRuntimeState): void => {
  runtimeRegistry.set(controller, state);
};

export const getGraphqlRuntimeState = (controller: object): GraphqlRuntimeState | undefined =>
  runtimeRegistry.get(controller);

const isGeneratedGraphqlRuntime = (value: unknown): value is GeneratedGraphqlRuntime => {
  if (!isObject(value)) return false;
  return typeof value['schemaSdl'] === 'string' && isObject(value['bindings']);
};

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

export const loadGeneratedGraphqlRuntime = async (
  runtimeModule: string,
): Promise<GeneratedGraphqlRuntime> => {
  const mod: unknown = await import(toImportSpecifier(runtimeModule));
  if (!isObject(mod) || !isGeneratedGraphqlRuntime(mod['graphqlRuntime'])) {
    throw new Error(`GraphQL runtime module must export graphqlRuntime: ${runtimeModule}`);
  }
  return mod['graphqlRuntime'];
};

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

const getCallableMethod = (
  instance: object,
  methodName: string,
): ((...args: unknown[]) => unknown) => {
  const method = Reflect.get(instance, methodName);
  if (typeof method !== 'function') {
    throw new Error(`GraphQL resolver method not found: ${methodName}`);
  }
  return method.bind(instance) as (...args: unknown[]) => unknown;
};

export const executeGraphqlRequest = async (
  options: ExecuteGraphqlRequestOptions,
): Promise<ExecutionResult> => {
  const schema = buildSchema(options.runtime.schemaSdl);
  const resolverCache = new Map<GraphqlResolverClass, object>();

  const resolveBinding = async (
    binding: GeneratedGraphqlBinding,
    parent: unknown,
    isRootField: boolean,
  ): Promise<unknown> => {
    const resolverClass = findResolverClass(options.resolvers, binding);
    const cached = resolverCache.get(resolverClass);
    const instance = cached ?? (await options.resolveResolver(resolverClass));
    if (!cached) resolverCache.set(resolverClass, instance);

    const method = getCallableMethod(instance, binding.method);
    return isRootField ? method() : method(parent);
  };

  for (const [typeName, fields] of Object.entries(options.runtime.bindings)) {
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

  for (const [typeName, fields] of Object.entries(options.runtime.enumFields ?? {})) {
    const type = schema.getType(typeName);
    if (!(type instanceof GraphQLObjectType)) continue;

    const graphqlFields = type.getFields();
    for (const [fieldName, mapping] of Object.entries(fields)) {
      const field = graphqlFields[fieldName];
      if (!field || field.resolve) continue;
      field.resolve = (parent: unknown) => {
        if (!isObject(parent)) return undefined;
        const value = parent[fieldName];
        return typeof value === 'string' ? mapping[value] : value;
      };
    }
  }

  return executeGraphql({
    schema,
    source: options.request.query,
    variableValues: options.request.variables,
    operationName: options.request.operationName,
  });
};
