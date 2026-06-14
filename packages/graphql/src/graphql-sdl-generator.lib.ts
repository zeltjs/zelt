import { resolve } from 'node:path';

import type { ClassMetadata, MethodInfo, TypeInfo } from '@zeltjs/decorator-metadata/inspect';
import { getOrCreateProgram, getTypeMetadata } from '@zeltjs/decorator-metadata/inspect';

import type { GqlSchemaResolver, GraphqlArgsSchemaRef } from './analyze-gql-args.lib';
import { extractGraphqlArgsRef, resolveGraphqlArgs } from './analyze-gql-args.lib';
import type { GraphqlOperationMetadata, GraphqlResolverClass } from './graphql-metadata.lib';
import type { GeneratedGraphqlRuntime } from './graphql-runtime.lib';
import type { GraphqlSchemaAdapter } from './json-schema-to-graphql-args.lib';
import { renderGraphqlArgs } from './json-schema-to-graphql-args.lib';
import {
  addEnumFieldMappingForType,
  addGraphqlField,
  convertTypeInfoToGraphqlRef,
  createGraphqlTypeContext,
  renderGraphqlDefinitions,
} from './type-to-graphql.lib';

type TS = typeof import('typescript');
type TSClassDeclaration = import('typescript').ClassDeclaration;
type TSMethodDeclaration = import('typescript').MethodDeclaration;
type TSType = import('typescript').Type;
type TSTypeChecker = import('typescript').TypeChecker;
type TSTypeReference = import('typescript').TypeReference;

export type GenerateSdlOptions = {
  readonly tsconfig?: string;
  readonly schemaAdapter?: GraphqlSchemaAdapter;
  readonly schemaResolver?: GqlSchemaResolver;
};

type OperationKind = 'query' | 'mutation' | 'resolveField';

type RootFields = {
  readonly query: Map<string, string>;
  readonly mutation: Map<string, string>;
};

type RuntimeBindings = Record<
  string,
  Record<string, { readonly resolver: string; readonly method: string }>
>;

type RuntimeEnumFields = Record<string, Record<string, Readonly<Record<string, string>>>>;

type AnalyzeResolversResult = {
  readonly schemaSdl: string;
  readonly runtime: GeneratedGraphqlRuntime;
};

type MethodTypeNames = {
  readonly returnTypeName: string | undefined;
  readonly parentTypeName: string | undefined;
  readonly argsSchemaRef: GraphqlArgsSchemaRef | undefined;
};

function toInspectableClass(cls: GraphqlResolverClass): new (...args: unknown[]) => object;
function toInspectableClass(cls: GraphqlResolverClass): unknown {
  return cls;
}

// ts.Type does not expose typeArguments structurally; the TypeReference shape
// is only known after the array/reference checks performed by the callers.
function narrowToTypeReference(type: TSType): TSTypeReference;
function narrowToTypeReference(type: TSType): TSType {
  return type;
}

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

const renderType = (ref: { readonly type: string; readonly nullable: boolean }): string =>
  ref.nullable ? ref.type : `${ref.type}!`;

const findClassDeclaration = (
  sourceFile: import('typescript').SourceFile,
  className: string,
  ts: TS,
): TSClassDeclaration | undefined => {
  let found: TSClassDeclaration | undefined;

  const visit = (node: import('typescript').Node): void => {
    if (found) return;
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
};

const findMethodDeclaration = (
  classNode: TSClassDeclaration,
  methodName: string,
  ts: TS,
): TSMethodDeclaration | undefined => {
  for (const member of classNode.members) {
    if (ts.isMethodDeclaration(member) && member.name.getText() === methodName) return member;
  }
  return undefined;
};

const isNullishTsType = (type: TSType, ts: TS): boolean => {
  const flags = type.getFlags();
  return (flags & ts.TypeFlags.Null) !== 0 || (flags & ts.TypeFlags.Undefined) !== 0;
};

const getTypeArguments = (type: TSType): readonly TSType[] =>
  narrowToTypeReference(type).typeArguments ?? [];

// Checks the target symbol instead of the rendered type text so aliased
// promises (type AliasedPromise = Promise<T>) unwrap too.
const unwrapPromiseType = (type: TSType, _checker: TSTypeChecker): TSType => {
  if (type.getSymbol()?.getName() !== 'Promise') return type;
  return getTypeArguments(type)[0] ?? type;
};

const getNamedTypeFromUnion = (
  members: readonly TSType[],
  checker: TSTypeChecker,
  ts: TS,
): string | undefined => {
  for (const member of members) {
    if (isNullishTsType(member, ts)) continue;
    const name = getNamedTypeFromTsType(member, checker, ts);
    if (name) return name;
  }
  return undefined;
};

const getOwnTypeName = (type: TSType): string | undefined => {
  const aliasName = type.aliasSymbol?.getName();
  if (aliasName) return aliasName;

  const symbolName = type.getSymbol()?.getName();
  return symbolName && symbolName !== '__type' ? symbolName : undefined;
};

const getNamedTypeFromTsType = (
  type: TSType,
  checker: TSTypeChecker,
  ts: TS,
): string | undefined => {
  const unwrapped = unwrapPromiseType(type, checker);

  if (unwrapped.isUnion()) {
    const fromMembers = getNamedTypeFromUnion(unwrapped.types, checker, ts);
    if (fromMembers) return fromMembers;
  }

  if (checker.isArrayType(unwrapped)) {
    const itemType = getTypeArguments(unwrapped)[0];
    return itemType ? getNamedTypeFromTsType(itemType, checker, ts) : undefined;
  }

  return getOwnTypeName(unwrapped);
};

/** @throws {Error} */
const getMethodTypeNames = (
  classNode: TSClassDeclaration,
  methodName: string,
  checker: TSTypeChecker,
  ts: TS,
): MethodTypeNames => {
  const methodNode = findMethodDeclaration(classNode, methodName, ts);
  const signature = methodNode ? checker.getSignatureFromDeclaration(methodNode) : undefined;
  if (!methodNode || !signature) {
    return { returnTypeName: undefined, parentTypeName: undefined, argsSchemaRef: undefined };
  }

  const returnTypeName = getNamedTypeFromTsType(signature.getReturnType(), checker, ts);
  const firstParam = signature.getParameters()[0];
  const parentTypeName = firstParam
    ? getNamedTypeFromTsType(checker.getTypeOfSymbol(firstParam), checker, ts)
    : undefined;
  const argsSchemaRef = extractGraphqlArgsRef(methodNode, classNode.getSourceFile(), ts);

  return { returnTypeName, parentTypeName, argsSchemaRef };
};

type ResolverClassNode = {
  readonly classNode: TSClassDeclaration;
  readonly checker: TSTypeChecker;
  readonly ts: TS;
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const findResolverClassNode = async (
  resolver: GraphqlResolverClass,
  metadata: ClassMetadata,
  options: GenerateSdlOptions,
): Promise<ResolverClassNode | undefined> => {
  if (!metadata.pos) return undefined;

  const programResult = await getOrCreateProgram(resolve(options.tsconfig ?? 'tsconfig.json'));
  if (programResult.isErr()) {
    throw new Error(`Failed to load TypeScript program: ${programResult.error.message}`);
  }

  const { checker, program, ts } = programResult.value;
  const sourceFile = program.getSourceFile(metadata.pos.sourceFile);
  if (!sourceFile) return undefined;

  const classNode = findClassDeclaration(sourceFile, resolver.name, ts);
  return classNode ? { classNode, checker, ts } : undefined;
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const getResolverTypeNames = async (
  resolver: GraphqlResolverClass,
  metadata: ClassMetadata,
  options: GenerateSdlOptions,
): Promise<Map<string, MethodTypeNames>> => {
  const found = await findResolverClassNode(resolver, metadata, options);
  if (!found) return new Map();

  const result = new Map<string, MethodTypeNames>();
  for (const method of metadata.methods) {
    if (typeof method.name !== 'string') continue;
    result.set(
      method.name,
      getMethodTypeNames(found.classNode, method.name, found.checker, found.ts),
    );
  }
  return result;
};

const fallbackTypeName = (fieldName: string): string =>
  `${fieldName.slice(0, 1).toUpperCase()}${fieldName.slice(1)}Payload`;

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const addRootField = (
  fields: Map<string, string>,
  fieldName: string,
  type: TypeInfo,
  typeNameHint: string | undefined,
  argsRendered: string,
  ctx: ReturnType<typeof createGraphqlTypeContext>,
): void => {
  const ref = convertTypeInfoToGraphqlRef(type, ctx, typeNameHint ?? fallbackTypeName(fieldName));
  const rendered = `${argsRendered}: ${renderType(ref)}`;
  const existing = fields.get(fieldName);
  if (existing && existing !== rendered) {
    throw new Error(`Duplicate GraphQL root field with incompatible type: ${fieldName}`);
  }
  fields.set(fieldName, rendered);
};

/** @throws {Error} */
const addRuntimeBinding = (
  bindings: RuntimeBindings,
  typeName: string,
  fieldName: string,
  resolverName: string,
  methodName: string,
): void => {
  const typeBindings = bindings[typeName] ?? {};
  const existing = typeBindings[fieldName];
  const next = { resolver: resolverName, method: methodName };
  if (existing && (existing.resolver !== next.resolver || existing.method !== next.method)) {
    throw new Error(`Duplicate GraphQL runtime binding: ${typeName}.${fieldName}`);
  }
  bindings[typeName] = { ...typeBindings, [fieldName]: next };
};

const printRoot = (name: 'Query' | 'Mutation', fields: Map<string, string>): string | undefined => {
  if (fields.size === 0) return undefined;
  const lines = [...fields.entries()].map(([fieldName, suffix]) => `  ${fieldName}${suffix}`);
  return `type ${name} {\n${lines.join('\n')}\n}`;
};

const buildSdl = (roots: RootFields, definitions: readonly string[]): string => {
  const parts = [
    printRoot('Query', roots.query),
    printRoot('Mutation', roots.mutation),
    ...definitions,
  ].flatMap((part) => (part === undefined ? [] : [part]));

  return parts.length > 0 ? `${parts.join('\n\n')}\n` : '';
};

const buildRuntimeEnumFields = (
  ctx: ReturnType<typeof createGraphqlTypeContext>,
): RuntimeEnumFields => {
  const enumFields: RuntimeEnumFields = {};
  for (const [typeName, fields] of ctx.enumFields.entries()) {
    enumFields[typeName] = Object.fromEntries(fields.entries());
  }
  return enumFields;
};

type AnalysisState = {
  readonly typeCtx: ReturnType<typeof createGraphqlTypeContext>;
  readonly roots: RootFields;
  readonly bindings: RuntimeBindings;
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const registerRootMethod = (
  state: AnalysisState,
  resolverName: string,
  methodName: string,
  fieldName: string,
  returnType: TypeInfo,
  kind: 'query' | 'mutation',
  names: MethodTypeNames | undefined,
  argsRendered: string,
): void => {
  const fields = kind === 'query' ? state.roots.query : state.roots.mutation;
  const rootTypeName = kind === 'query' ? 'Query' : 'Mutation';
  addRootField(fields, fieldName, returnType, names?.returnTypeName, argsRendered, state.typeCtx);
  addEnumFieldMappingForType(state.typeCtx, rootTypeName, fieldName, returnType);
  addRuntimeBinding(state.bindings, rootTypeName, fieldName, resolverName, methodName);
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const registerFieldMethod = (
  state: AnalysisState,
  resolverName: string,
  methodName: string,
  fieldName: string,
  returnType: TypeInfo,
  names: MethodTypeNames | undefined,
): void => {
  if (!names?.parentTypeName) {
    throw new Error(`@ResolveField() ${resolverName}.${methodName} requires named parent type`);
  }
  addGraphqlField(state.typeCtx, names.parentTypeName, fieldName, returnType, names.returnTypeName);
  addRuntimeBinding(state.bindings, names.parentTypeName, fieldName, resolverName, methodName);
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const registerResolverMethod = (
  state: AnalysisState,
  resolverName: string,
  methodName: string,
  fieldName: string,
  returnType: TypeInfo,
  kind: OperationKind,
  names: MethodTypeNames | undefined,
  argsRendered: string,
): void => {
  if (kind === 'resolveField') {
    if (argsRendered !== '') {
      throw new Error(
        `args() on @ResolveField() is not supported yet: ${resolverName}.${methodName}`,
      );
    }
    registerFieldMethod(state, resolverName, methodName, fieldName, returnType, names);
    return;
  }
  registerRootMethod(
    state,
    resolverName,
    methodName,
    fieldName,
    returnType,
    kind,
    names,
    argsRendered,
  );
};

/** @throws {Error} */
const renderMethodArgs = async (
  names: MethodTypeNames | undefined,
  resolverName: string,
  methodName: string,
  options: GenerateSdlOptions,
): Promise<string> => {
  const ref = names?.argsSchemaRef;
  if (!ref) return '';
  if (!options.schemaAdapter) {
    throw new Error(`args() requires the schemaAdapter option: ${resolverName}.${methodName}`);
  }
  const args = await resolveGraphqlArgs(ref, options.schemaAdapter, options.schemaResolver);
  return renderGraphqlArgs(args);
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const analyzeResolver = async (
  resolver: GraphqlResolverClass,
  state: AnalysisState,
  options: GenerateSdlOptions,
): Promise<void> => {
  const metadataResult = await getTypeMetadata(toInspectableClass(resolver), {
    ...(options.tsconfig ? { tsconfig: options.tsconfig } : {}),
    expandStrategy: 'always',
  });
  if (metadataResult.isErr()) {
    const err = metadataResult.error;
    throw new Error(`Failed to inspect GraphQL resolver ${resolver.name}: ${err.message}`);
  }

  const metadata = metadataResult.value;
  const methodTypeNames = await getResolverTypeNames(resolver, metadata, options);

  for (const method of metadata.methods) {
    if (typeof method.name !== 'string') continue;
    const operation = getOperationMetadata(method);
    if (!operation) continue;

    const names = methodTypeNames.get(method.name);
    const argsRendered = await renderMethodArgs(names, resolver.name, method.name, options);
    registerResolverMethod(
      state,
      resolver.name,
      method.name,
      operation.fieldName ?? method.name,
      method.returnType,
      operation.kind,
      names,
      argsRendered,
    );
  }
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const analyzeResolvers = async (
  resolvers: readonly GraphqlResolverClass[],
  options: GenerateSdlOptions = {},
): Promise<AnalyzeResolversResult> => {
  const state: AnalysisState = {
    typeCtx: createGraphqlTypeContext(),
    roots: { query: new Map(), mutation: new Map() },
    bindings: {},
  };

  for (const resolver of resolvers) {
    await analyzeResolver(resolver, state, options);
  }

  const schemaSdl = buildSdl(state.roots, renderGraphqlDefinitions(state.typeCtx));
  return {
    schemaSdl,
    runtime: {
      schemaSdl,
      bindings: state.bindings,
      enumFields: buildRuntimeEnumFields(state.typeCtx),
    },
  };
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const generateSdlForResolvers = async (
  resolvers: readonly GraphqlResolverClass[],
  options: GenerateSdlOptions = {},
): Promise<string> => {
  const result = await analyzeResolvers(resolvers, options);
  return result.schemaSdl;
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const generateGraphqlRuntimeForResolvers = async (
  resolvers: readonly GraphqlResolverClass[],
  options: GenerateSdlOptions = {},
): Promise<GeneratedGraphqlRuntime> => {
  const result = await analyzeResolvers(resolvers, options);
  return result.runtime;
};
