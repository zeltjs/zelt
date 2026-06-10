import { resolve } from 'node:path';

import type { ClassMetadata, MethodInfo, TypeInfo } from '@zeltjs/decorator-metadata/inspect';
import { getOrCreateProgram, getTypeMetadata } from '@zeltjs/decorator-metadata/inspect';

import type { GraphqlResolverClass } from './graphql.metadata';
import type { GeneratedGraphqlRuntime } from './graphql-runtime.lib';
import {
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

export type GenerateSdlOptions = {
  readonly tsconfig?: string;
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
};

function toInspectableClass(cls: GraphqlResolverClass): new (...args: unknown[]) => object;
function toInspectableClass(cls: GraphqlResolverClass): unknown {
  return cls;
}

const isOperationKind = (kind: unknown): kind is OperationKind =>
  kind === 'query' || kind === 'mutation' || kind === 'resolveField';

const getOperationKind = (method: MethodInfo): OperationKind | undefined => {
  for (const prop of method.props) {
    if (typeof prop !== 'object' || prop === null) continue;
    const kind = Reflect.get(prop, 'kind');
    if (isOperationKind(kind)) return kind;
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
  (type as import('typescript').TypeReference).typeArguments ?? [];

const unwrapPromiseType = (type: TSType, checker: TSTypeChecker): TSType => {
  if (!checker.typeToString(type).startsWith('Promise<')) return type;
  return getTypeArguments(type)[0] ?? type;
};

const getNamedTypeFromTsType = (
  type: TSType,
  checker: TSTypeChecker,
  ts: TS,
): string | undefined => {
  const unwrapped = unwrapPromiseType(type, checker);

  if (unwrapped.isUnion()) {
    for (const member of unwrapped.types) {
      if (isNullishTsType(member, ts)) continue;
      const name = getNamedTypeFromTsType(member, checker, ts);
      if (name) return name;
    }
  }

  if (checker.isArrayType(unwrapped)) {
    const itemType = getTypeArguments(unwrapped)[0];
    return itemType ? getNamedTypeFromTsType(itemType, checker, ts) : undefined;
  }

  const aliasName = unwrapped.aliasSymbol?.getName();
  if (aliasName) return aliasName;

  const symbolName = unwrapped.getSymbol()?.getName();
  if (symbolName && symbolName !== '__type') return symbolName;

  return undefined;
};

const getMethodTypeNames = (
  classNode: TSClassDeclaration,
  methodName: string,
  checker: TSTypeChecker,
  ts: TS,
): MethodTypeNames => {
  const methodNode = findMethodDeclaration(classNode, methodName, ts);
  const signature = methodNode ? checker.getSignatureFromDeclaration(methodNode) : undefined;
  if (!signature) return { returnTypeName: undefined, parentTypeName: undefined };

  const returnTypeName = getNamedTypeFromTsType(signature.getReturnType(), checker, ts);
  const firstParam = signature.getParameters()[0];
  const parentTypeName = firstParam
    ? getNamedTypeFromTsType(checker.getTypeOfSymbol(firstParam), checker, ts)
    : undefined;

  return { returnTypeName, parentTypeName };
};

const getResolverTypeNames = async (
  resolver: GraphqlResolverClass,
  metadata: ClassMetadata,
  options: GenerateSdlOptions,
): Promise<Map<string, MethodTypeNames>> => {
  if (!metadata.pos) return new Map();

  const programResult = await getOrCreateProgram(resolve(options.tsconfig ?? 'tsconfig.json'));
  if (programResult.isErr()) {
    throw new Error(`Failed to load TypeScript program: ${programResult.error.message}`);
  }

  const { checker, program, ts } = programResult.value;
  const sourceFile = program.getSourceFile(metadata.pos.sourceFile);
  if (!sourceFile) return new Map();

  const classNode = findClassDeclaration(sourceFile, resolver.name, ts);
  if (!classNode) return new Map();

  const result = new Map<string, MethodTypeNames>();
  for (const method of metadata.methods) {
    if (typeof method.name !== 'string') continue;
    result.set(method.name, getMethodTypeNames(classNode, method.name, checker, ts));
  }
  return result;
};

const fallbackTypeName = (fieldName: string): string =>
  `${fieldName.slice(0, 1).toUpperCase()}${fieldName.slice(1)}Payload`;

const addRootField = (
  fields: Map<string, string>,
  fieldName: string,
  type: TypeInfo,
  typeNameHint: string | undefined,
  ctx: ReturnType<typeof createGraphqlTypeContext>,
): void => {
  const ref = convertTypeInfoToGraphqlRef(type, ctx, typeNameHint ?? fallbackTypeName(fieldName));
  const rendered = renderType(ref);
  const existing = fields.get(fieldName);
  if (existing && existing !== rendered) {
    throw new Error(`Duplicate GraphQL root field with incompatible type: ${fieldName}`);
  }
  fields.set(fieldName, rendered);
};

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
  const lines = [...fields.entries()].map(([fieldName, type]) => `  ${fieldName}: ${type}`);
  return `type ${name} {\n${lines.join('\n')}\n}`;
};

const buildSdl = (roots: RootFields, definitions: readonly string[]): string => {
  const parts = [
    printRoot('Query', roots.query),
    printRoot('Mutation', roots.mutation),
    ...definitions,
  ].filter((part): part is string => part !== undefined);

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

const analyzeResolvers = async (
  resolvers: readonly GraphqlResolverClass[],
  options: GenerateSdlOptions = {},
): Promise<AnalyzeResolversResult> => {
  const ctx = createGraphqlTypeContext();
  const roots: RootFields = { query: new Map(), mutation: new Map() };
  const bindings: RuntimeBindings = {};

  for (const resolver of resolvers) {
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
      const operationKind = getOperationKind(method);
      if (!operationKind) continue;

      const names = methodTypeNames.get(method.name);
      if (operationKind === 'query') {
        addRootField(roots.query, method.name, method.returnType, names?.returnTypeName, ctx);
        addRuntimeBinding(bindings, 'Query', method.name, resolver.name, method.name);
      } else if (operationKind === 'mutation') {
        addRootField(roots.mutation, method.name, method.returnType, names?.returnTypeName, ctx);
        addRuntimeBinding(bindings, 'Mutation', method.name, resolver.name, method.name);
      } else {
        const parentTypeName = names?.parentTypeName;
        if (!parentTypeName) {
          throw new Error(
            `@ResolveField() ${resolver.name}.${method.name} requires named parent type`,
          );
        }
        addGraphqlField(ctx, parentTypeName, method.name, method.returnType, names?.returnTypeName);
        addRuntimeBinding(bindings, parentTypeName, method.name, resolver.name, method.name);
      }
    }
  }

  const schemaSdl = buildSdl(roots, renderGraphqlDefinitions(ctx));
  return { schemaSdl, runtime: { schemaSdl, bindings, enumFields: buildRuntimeEnumFields(ctx) } };
};

export const generateSdlForResolvers = async (
  resolvers: readonly GraphqlResolverClass[],
  options: GenerateSdlOptions = {},
): Promise<string> => {
  const result = await analyzeResolvers(resolvers, options);
  return result.schemaSdl;
};

export const generateGraphqlRuntimeForResolvers = async (
  resolvers: readonly GraphqlResolverClass[],
  options: GenerateSdlOptions = {},
): Promise<GeneratedGraphqlRuntime> => {
  const result = await analyzeResolvers(resolvers, options);
  return result.runtime;
};
