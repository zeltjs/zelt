import type { ClassMetadata, MethodInfo } from '@zeltjs/decorator-metadata/inspect';
import { getTypeMetadata } from '@zeltjs/decorator-metadata/inspect';
import type { ObjectTypeDefinitionNode } from 'graphql';
import { Kind, parse } from 'graphql';

import type { GraphqlOperationMetadata, GraphqlResolverClass } from './graphql-metadata.lib';
import type { GeneratedGraphqlBinding, GraphqlRuntimeManifest } from './graphql-runtime.lib';

type SchemaFirstRuntimeOptions = {
  readonly schemaSdl: string;
  readonly tsconfig?: string;
};

type SchemaFirstSdlIndex = {
  readonly queryFields: ReadonlySet<string>;
  readonly mutationFields: ReadonlySet<string>;
  readonly objectFields: ReadonlyMap<string, ReadonlySet<string>>;
};

type RuntimeBindings = GraphqlRuntimeManifest['bindings'];

function toInspectableClass(cls: GraphqlResolverClass): new (...args: unknown[]) => object;
function toInspectableClass(cls: GraphqlResolverClass): unknown {
  return cls;
}

const collectFieldNames = (type: ObjectTypeDefinitionNode | undefined): ReadonlySet<string> =>
  new Set((type?.fields ?? []).map((field) => field.name.value));

const buildSdlIndex = (schemaSdl: string): SchemaFirstSdlIndex => {
  const document = parse(schemaSdl);
  const objectTypes = new Map<string, ObjectTypeDefinitionNode>();

  for (const definition of document.definitions) {
    if (definition.kind === Kind.OBJECT_TYPE_DEFINITION) {
      objectTypes.set(definition.name.value, definition);
    }
  }

  const objectFields = new Map<string, ReadonlySet<string>>();
  for (const [typeName, type] of objectTypes.entries()) {
    if (typeName === 'Query' || typeName === 'Mutation') continue;
    objectFields.set(typeName, collectFieldNames(type));
  }

  return {
    queryFields: collectFieldNames(objectTypes.get('Query')),
    mutationFields: collectFieldNames(objectTypes.get('Mutation')),
    objectFields,
  };
};

const getOperationMetadata = (method: MethodInfo): GraphqlOperationMetadata | undefined => {
  for (const prop of method.props) {
    const kind: unknown = Reflect.get(prop, 'kind');
    if (kind === 'query' || kind === 'mutation' || kind === 'resolveField') {
      const fieldName: unknown = Reflect.get(prop, 'fieldName');
      return {
        kind,
        ...(typeof fieldName === 'string' ? { fieldName } : {}),
      };
    }
  }
  return undefined;
};

/** @throws {Error} */
const addRuntimeBinding = (
  bindings: RuntimeBindings,
  typeName: string,
  fieldName: string,
  binding: GeneratedGraphqlBinding,
): void => {
  const typeBindings = bindings[typeName] ?? {};
  const existing = typeBindings[fieldName];
  if (existing && (existing.resolver !== binding.resolver || existing.method !== binding.method)) {
    throw new Error(`Duplicate GraphQL runtime binding: ${typeName}.${fieldName}`);
  }
  bindings[typeName] = { ...typeBindings, [fieldName]: binding };
};

/** @throws {Error} */
const requireRootField = (
  fields: ReadonlySet<string>,
  typeName: 'Query' | 'Mutation',
  fieldName: string,
): void => {
  if (fields.has(fieldName)) return;
  throw new Error(
    `Schema-first binding currently requires method name to match field name: ${typeName}.${fieldName}`,
  );
};

/** @throws {Error} */
const findResolveFieldOwner = (index: SchemaFirstSdlIndex, fieldName: string): string => {
  const owners = [...index.objectFields.entries()].flatMap(([typeName, fields]) =>
    fields.has(fieldName) ? [typeName] : [],
  );
  if (owners.length === 1) return owners[0] ?? '';
  if (owners.length === 0) {
    throw new Error(
      `Schema-first binding could not find schema field for @ResolveField(): ${fieldName}`,
    );
  }
  throw new Error(`Schema-first binding is ambiguous for @ResolveField(): ${fieldName}`);
};

/** @throws {Error} */
const registerOperation = (
  bindings: RuntimeBindings,
  index: SchemaFirstSdlIndex,
  resolverName: string,
  methodName: string,
  operation: GraphqlOperationMetadata,
): void => {
  const fieldName = operation.fieldName ?? methodName;
  const binding = { resolver: resolverName, method: methodName };
  if (operation.kind === 'query') {
    requireRootField(index.queryFields, 'Query', fieldName);
    addRuntimeBinding(bindings, 'Query', fieldName, binding);
    return;
  }
  if (operation.kind === 'mutation') {
    requireRootField(index.mutationFields, 'Mutation', fieldName);
    addRuntimeBinding(bindings, 'Mutation', fieldName, binding);
    return;
  }
  addRuntimeBinding(bindings, findResolveFieldOwner(index, fieldName), fieldName, binding);
};

/** @throws {Error} */
const requireRootBindings = (
  fields: ReadonlySet<string>,
  bindings: RuntimeBindings,
  typeName: 'Query' | 'Mutation',
): void => {
  const typeBindings = bindings[typeName] ?? {};
  for (const fieldName of fields) {
    if (typeBindings[fieldName] !== undefined) continue;
    throw new Error(`Schema-first resolver binding missing for ${typeName}.${fieldName}`);
  }
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const registerResolver = async (
  bindings: RuntimeBindings,
  index: SchemaFirstSdlIndex,
  resolver: GraphqlResolverClass,
  options: SchemaFirstRuntimeOptions,
): Promise<void> => {
  const metadataResult = await getTypeMetadata(toInspectableClass(resolver), {
    expandStrategy: 'always',
    ...(options.tsconfig !== undefined && { tsconfig: options.tsconfig }),
  });
  if (metadataResult.isErr()) {
    throw new Error(
      `Failed to inspect GraphQL resolver ${resolver.name}: ${metadataResult.error.message}`,
    );
  }

  const metadata: ClassMetadata = metadataResult.value;
  for (const method of metadata.methods) {
    if (typeof method.name !== 'string') continue;
    const operation = getOperationMetadata(method);
    if (!operation) continue;
    registerOperation(bindings, index, resolver.name, method.name, operation);
  }
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const generateSchemaFirstGraphqlRuntimeForResolvers = async (
  resolvers: readonly GraphqlResolverClass[],
  options: SchemaFirstRuntimeOptions,
): Promise<GraphqlRuntimeManifest> => {
  const index = buildSdlIndex(options.schemaSdl);
  const bindings: RuntimeBindings = {};
  for (const resolver of resolvers) {
    await registerResolver(bindings, index, resolver, options);
  }
  requireRootBindings(index.queryFields, bindings, 'Query');
  requireRootBindings(index.mutationFields, bindings, 'Mutation');
  return {
    schemaSdl: options.schemaSdl,
    bindings,
  };
};
