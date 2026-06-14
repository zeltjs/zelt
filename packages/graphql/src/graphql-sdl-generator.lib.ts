import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
  ClassMetadata,
  MethodInfo,
  TypedPropertyInfo,
  TypeInfo,
} from '@zeltjs/decorator-metadata/inspect';
import { getOrCreateProgram, getTypeMetadata } from '@zeltjs/decorator-metadata/inspect';

import type { GqlSchemaResolver, GraphqlArgsSchemaRef } from './analyze-gql-args.lib';
import { extractGraphqlArgsRef, resolveGraphqlArgs } from './analyze-gql-args.lib';
import { parseGqlScalar } from './gql-scalar.lib';
import type { GraphqlOperationMetadata, GraphqlResolverClass } from './graphql-metadata.lib';
import type { GeneratedGraphqlRuntime } from './graphql-runtime.lib';
import type { GraphqlSchemaAdapter } from './json-schema-to-graphql-args.lib';
import { renderGraphqlArgs } from './json-schema-to-graphql-args.lib';
import type { GraphqlOutputTypeInfo, GraphqlScalarRef } from './type-to-graphql.lib';
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
type TSTypeAliasDeclaration = import('typescript').TypeAliasDeclaration;
type TSTypeElement = import('typescript').TypeElement;
type TSTypeNode = import('typescript').TypeNode;
type TSType = import('typescript').Type;
type TSTypeChecker = import('typescript').TypeChecker;
type TSTypeReference = import('typescript').TypeReference;

export type GenerateSdlOptions = {
  readonly tsconfig?: string;
  readonly schemaAdapter?: GraphqlSchemaAdapter;
  readonly schemaResolver?: GqlSchemaResolver;
  readonly scalarResolver?: GqlSchemaResolver;
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

type RuntimeUnionFields = Record<string, Record<string, string[]>>;

type AnalyzeResolversResult = {
  readonly schemaSdl: string;
  readonly runtime: GeneratedGraphqlRuntime;
};

type MethodTypeNames = {
  readonly returnTypeName: string | undefined;
  readonly parentTypeName: string | undefined;
  readonly argsSchemaRef: GraphqlArgsSchemaRef | undefined;
  readonly returnType: GraphqlOutputTypeInfo | undefined;
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

const isNullishTypeInfo = (type: TypeInfo): boolean =>
  type.kind === 'primitive' && (type.type === 'null' || type.type === 'undefined');

const getTypeArguments = (type: TSType): readonly TSType[] =>
  narrowToTypeReference(type).typeArguments ?? [];

const toImportSpecifier = (modulePath: string): string => {
  if (modulePath.startsWith('file:')) return modulePath;
  if (isAbsolute(modulePath) || modulePath.startsWith('./') || modulePath.startsWith('../')) {
    return pathToFileURL(modulePath).href;
  }
  return modulePath;
};

/** @throws {Error} */
const defaultScalarResolver: GqlSchemaResolver = async (modulePath) => {
  const imported: unknown = await import(toImportSpecifier(modulePath));
  if (typeof imported !== 'object' || imported === null) {
    throw new Error(`Module '${modulePath}' did not resolve to an object`);
  }
  return { ...imported };
};

const resolveRelativeModuleSpecifier = (
  sourceFile: import('typescript').SourceFile,
  specifier: string,
): string => {
  if (!specifier.startsWith('.')) return specifier;
  const resolved = resolve(dirname(sourceFile.fileName), specifier);
  return resolved.endsWith('.ts') || resolved.endsWith('.js') ? resolved : `${resolved}.ts`;
};

const findExportNameInElements = (
  elements: readonly import('typescript').ImportSpecifier[],
  localName: string,
): string | undefined => {
  for (const elem of elements) {
    if (elem.name.text !== localName) continue;
    return elem.propertyName?.text ?? elem.name.text;
  }
  return undefined;
};

const resolveImportedName = (
  importDecl: import('typescript').ImportDeclaration,
  localName: string,
  ts: TS,
): string | undefined => {
  const namedBindings = importDecl.importClause?.namedBindings;
  if (!namedBindings || !ts.isNamedImports(namedBindings)) return undefined;
  return findExportNameInElements(namedBindings.elements, localName);
};

const findIdentifierImport = (
  sourceFile: import('typescript').SourceFile,
  localName: string,
  ts: TS,
): GraphqlScalarRef | undefined => {
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const exportName = resolveImportedName(stmt, localName, ts);
    if (!exportName) continue;
    return {
      modulePath: resolveRelativeModuleSpecifier(sourceFile, stmt.moduleSpecifier.text),
      exportName,
    };
  }
  return undefined;
};

const hasExportedLocalVariable = (
  sourceFile: import('typescript').SourceFile,
  identifierName: string,
  ts: TS,
): boolean => {
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const isExported = stmt.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!isExported) continue;
    if (
      stmt.declarationList.declarations.some(
        (decl) => ts.isIdentifier(decl.name) && decl.name.text === identifierName,
      )
    ) {
      return true;
    }
  }
  return false;
};

const getEntityNameText = (name: import('typescript').EntityName, ts: TS): string | undefined => {
  if (ts.isIdentifier(name)) return name.text;
  return undefined;
};

const getTypeReferenceName = (typeNode: TSTypeNode | undefined, ts: TS): string | undefined => {
  if (!typeNode || !ts.isTypeReferenceNode(typeNode)) return undefined;
  return ts.isIdentifier(typeNode.typeName) ? typeNode.typeName.text : undefined;
};

const resolveScalarIdentifier = (
  sourceFile: import('typescript').SourceFile,
  localName: string,
  ts: TS,
): GraphqlScalarRef | undefined => {
  const imported = findIdentifierImport(sourceFile, localName, ts);
  if (imported) return imported;
  if (hasExportedLocalVariable(sourceFile, localName, ts)) {
    return { modulePath: sourceFile.fileName, exportName: localName };
  }
  return undefined;
};

const resolveGqlOutputScalarRef = (
  typeNode: TSTypeNode | undefined,
  sourceFile: import('typescript').SourceFile,
  checker: TSTypeChecker,
  ts: TS,
): GraphqlScalarRef | undefined => {
  const typeName = getTypeReferenceName(typeNode, ts);
  if (typeName === 'GqlOutput') return resolveDirectGqlOutputScalarRef(typeNode, sourceFile, ts);

  const alias = getTypeAliasDeclaration(typeNode, checker, ts);
  return alias
    ? resolveGqlOutputScalarRef(alias.type, alias.getSourceFile(), checker, ts)
    : undefined;
};

const resolveDirectGqlOutputScalarRef = (
  typeNode: TSTypeNode | undefined,
  sourceFile: import('typescript').SourceFile,
  ts: TS,
): GraphqlScalarRef | undefined => {
  if (!typeNode || !ts.isTypeReferenceNode(typeNode)) return undefined;
  const scalarTypeArg = typeNode.typeArguments?.[0];
  if (!scalarTypeArg || !ts.isTypeQueryNode(scalarTypeArg)) return undefined;
  const scalarName = getEntityNameText(scalarTypeArg.exprName, ts);
  return scalarName ? resolveScalarIdentifier(sourceFile, scalarName, ts) : undefined;
};

/** @throws {Error} */
const resolveGraphqlScalarTypeInfo = async (
  ref: GraphqlScalarRef,
  options: GenerateSdlOptions,
): Promise<GraphqlOutputTypeInfo> => {
  const resolver = options.scalarResolver ?? options.schemaResolver ?? defaultScalarResolver;
  const mod = await resolver(ref.modulePath);
  const scalar = parseGqlScalar(mod[ref.exportName]);
  if (!scalar) {
    throw new Error(`Export '${ref.exportName}' is not a gqlScalar: ${ref.modulePath}`);
  }
  return { kind: 'graphqlScalar', name: scalar.name, ref, scalar };
};

const getTypeAliasDeclaration = (
  typeNode: TSTypeNode | undefined,
  checker: TSTypeChecker,
  ts: TS,
): TSTypeAliasDeclaration | undefined => {
  if (!typeNode || !ts.isTypeReferenceNode(typeNode)) return undefined;
  const symbol = resolveTypeReferenceSymbol(typeNode, checker, ts);
  return toTypeAliasDeclaration(symbol?.declarations?.[0], ts);
};

const resolveTypeReferenceSymbol = (
  typeNode: import('typescript').TypeReferenceNode,
  checker: TSTypeChecker,
  ts: TS,
): import('typescript').Symbol | undefined => {
  const symbol = checker.getSymbolAtLocation(typeNode.typeName);
  if (!symbol) return undefined;
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
};

const toTypeAliasDeclaration = (
  declaration: import('typescript').Declaration | undefined,
  ts: TS,
): TSTypeAliasDeclaration | undefined =>
  declaration && ts.isTypeAliasDeclaration(declaration) ? declaration : undefined;

const getPropertyTypeNodeMap = (
  typeNode: TSTypeNode | undefined,
  checker: TSTypeChecker,
  ts: TS,
): Map<string, TSTypeNode> => {
  const result = new Map<string, TSTypeNode>();
  const collect = (members: readonly TSTypeElement[]): void => {
    for (const member of members) {
      if (!ts.isPropertySignature(member)) continue;
      if (!member.type) continue;
      if (!ts.isIdentifier(member.name)) continue;
      result.set(member.name.text, member.type);
    }
  };

  if (!typeNode) return result;
  if (ts.isTypeLiteralNode(typeNode)) {
    collect(typeNode.members);
    return result;
  }

  const alias = getTypeAliasDeclaration(typeNode, checker, ts);
  if (alias && ts.isTypeLiteralNode(alias.type)) {
    collect(alias.type.members);
  }
  return result;
};

const unwrapReadonlyTypeNode = (
  typeNode: TSTypeNode | undefined,
  ts: TS,
): TSTypeNode | undefined =>
  typeNode && ts.isTypeOperatorNode(typeNode) ? typeNode.type : typeNode;

const getArrayElementTypeNode = (
  typeNode: TSTypeNode | undefined,
  ts: TS,
): TSTypeNode | undefined => {
  const unwrapped = unwrapReadonlyTypeNode(typeNode, ts);
  if (!unwrapped) return undefined;
  if (ts.isArrayTypeNode(unwrapped)) return unwrapped.elementType;
  if (!ts.isTypeReferenceNode(unwrapped)) return undefined;
  const name = getTypeReferenceName(unwrapped, ts);
  return name === 'ReadonlyArray' || name === 'Array' ? unwrapped.typeArguments?.[0] : undefined;
};

const getPromiseInnerTypeNode = (
  typeNode: TSTypeNode | undefined,
  ts: TS,
): TSTypeNode | undefined => {
  if (!typeNode || !ts.isTypeReferenceNode(typeNode)) return undefined;
  if (!ts.isIdentifier(typeNode.typeName) || typeNode.typeName.text !== 'Promise') return undefined;
  return typeNode.typeArguments?.[0];
};

const getUnionTypeNode = (
  typeNode: TSTypeNode | undefined,
  checker: TSTypeChecker,
  ts: TS,
): import('typescript').UnionTypeNode | undefined => {
  const unwrapped = unwrapReadonlyTypeNode(typeNode, ts);
  if (!unwrapped) return undefined;
  if (ts.isUnionTypeNode(unwrapped)) return unwrapped;
  const alias = getTypeAliasDeclaration(unwrapped, checker, ts);
  return alias && ts.isUnionTypeNode(alias.type) ? alias.type : undefined;
};

const isNullishTypeNode = (typeNode: TSTypeNode, ts: TS): boolean =>
  typeNode.kind === ts.SyntaxKind.UndefinedKeyword ||
  (ts.isLiteralTypeNode(typeNode) && typeNode.literal.kind === ts.SyntaxKind.NullKeyword);

const getTypeNodeName = (
  typeNode: TSTypeNode | undefined,
  type: TSType,
  checker: TSTypeChecker,
  ts: TS,
): string | undefined => {
  if (typeNode && ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    return typeNode.typeName.text;
  }
  return getOwnTypeName(type) ?? checker.typeToString(type);
};

const hasSameObjectProperties = (
  typeInfo: TypeInfo,
  propertyTypeNodes: ReadonlyMap<string, TSTypeNode>,
): boolean => {
  if (typeInfo.kind !== 'object') return false;
  const typeInfoNames = new Set(typeInfo.properties.map((prop) => prop.name));
  if (typeInfoNames.size !== propertyTypeNodes.size) return false;
  return [...propertyTypeNodes.keys()].every((name) => typeInfoNames.has(name));
};

const findUnionMemberBaseType = (
  candidates: readonly TypeInfo[],
  memberNode: TSTypeNode | undefined,
  fallbackIndex: number,
  checker: TSTypeChecker,
  ts: TS,
): TypeInfo => {
  const propertyTypeNodes = getPropertyTypeNodeMap(memberNode, checker, ts);
  const matched = candidates.find((candidate) =>
    hasSameObjectProperties(candidate, propertyTypeNodes),
  );
  return matched ?? candidates[fallbackIndex] ?? { kind: 'unknown' };
};

const findUnionMemberTypeNode = (
  nodes: readonly TSTypeNode[],
  memberBase: TypeInfo,
  fallbackIndex: number,
  checker: TSTypeChecker,
  ts: TS,
): TSTypeNode | undefined => {
  if (isNullishTypeInfo(memberBase)) {
    return nodes.find((node) => isNullishTypeNode(node, ts)) ?? nodes[fallbackIndex];
  }
  if (memberBase.kind === 'object') {
    return (
      nodes.find((node) =>
        hasSameObjectProperties(memberBase, getPropertyTypeNodeMap(node, checker, ts)),
      ) ?? nodes[fallbackIndex]
    );
  }
  return nodes[fallbackIndex];
};

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

type EnrichTypeContext = {
  readonly sourceFile: import('typescript').SourceFile;
  readonly checker: TSTypeChecker;
  readonly ts: TS;
  readonly options: GenerateSdlOptions;
};

/** @throws {Error} */
const enrichGraphqlTypeInfo = async (
  base: TypeInfo,
  tsType: TSType,
  typeNode: TSTypeNode | undefined,
  ctx: EnrichTypeContext,
): Promise<GraphqlOutputTypeInfo> => {
  const scalarRef = resolveGqlOutputScalarRef(typeNode, ctx.sourceFile, ctx.checker, ctx.ts);
  if (scalarRef) return resolveGraphqlScalarTypeInfo(scalarRef, ctx.options);
  if (base.kind === 'promise') return enrichPromiseTypeInfo(base, tsType, typeNode, ctx);
  if (base.kind === 'array') return enrichArrayTypeInfo(base, tsType, typeNode, ctx);
  if (base.kind === 'object') return enrichObjectTypeInfo(base, tsType, typeNode, ctx);
  if (base.kind === 'union') return enrichUnionTypeInfo(base, tsType, typeNode, ctx);
  return base;
};

/** @throws {Error} */
const enrichPromiseTypeInfo = async (
  base: TypeInfo & { kind: 'promise' },
  tsType: TSType,
  typeNode: TSTypeNode | undefined,
  ctx: EnrichTypeContext,
): Promise<GraphqlOutputTypeInfo> => ({
  ...base,
  inner: await enrichGraphqlTypeInfo(
    base.inner,
    unwrapPromiseType(tsType, ctx.checker),
    getPromiseInnerTypeNode(typeNode, ctx.ts),
    ctx,
  ),
});

/** @throws {Error} */
const enrichArrayTypeInfo = async (
  base: TypeInfo & { kind: 'array' },
  tsType: TSType,
  typeNode: TSTypeNode | undefined,
  ctx: EnrichTypeContext,
): Promise<GraphqlOutputTypeInfo> => ({
  ...base,
  items: await enrichGraphqlTypeInfo(
    base.items,
    getTypeArguments(tsType)[0] ?? tsType,
    getArrayElementTypeNode(typeNode, ctx.ts),
    ctx,
  ),
});

/** @throws {Error} */
const enrichObjectProperty = async (
  prop: TypedPropertyInfo,
  propertyTypeNodes: ReadonlyMap<string, TSTypeNode>,
  tsType: TSType,
  ctx: EnrichTypeContext,
): Promise<Omit<TypedPropertyInfo, 'type'> & { readonly type: GraphqlOutputTypeInfo }> => {
  const propTypeNode = propertyTypeNodes.get(prop.name);
  const propTsType = propTypeNode ? ctx.checker.getTypeFromTypeNode(propTypeNode) : tsType;
  return {
    ...prop,
    type: await enrichGraphqlTypeInfo(prop.type, propTsType, propTypeNode, ctx),
  };
};

/** @throws {Error} */
const enrichObjectTypeInfo = async (
  base: TypeInfo & { kind: 'object' },
  tsType: TSType,
  typeNode: TSTypeNode | undefined,
  ctx: EnrichTypeContext,
): Promise<GraphqlOutputTypeInfo> => {
  const propertyTypeNodes = getPropertyTypeNodeMap(typeNode, ctx.checker, ctx.ts);
  const properties = await Promise.all(
    base.properties.map((prop) => enrichObjectProperty(prop, propertyTypeNodes, tsType, ctx)),
  );
  return { ...base, properties };
};

const isNamedObjectUnion = (
  unionTypeNode: import('typescript').UnionTypeNode | undefined,
  nonNullishBaseTypes: readonly TypeInfo[],
  nonNullishTypeNodes: readonly TSTypeNode[] | undefined,
): boolean =>
  unionTypeNode !== undefined &&
  nonNullishBaseTypes.length > 1 &&
  nonNullishTypeNodes !== undefined &&
  nonNullishBaseTypes.every((member) => member.kind === 'object');

/** @throws {Error} */
const enrichNamedUnionMember = async (
  unionName: string,
  memberNode: TSTypeNode,
  index: number,
  nonNullishBaseTypes: readonly TypeInfo[],
  ctx: EnrichTypeContext,
): Promise<{ readonly name: string; readonly type: GraphqlOutputTypeInfo }> => {
  const memberType = ctx.checker.getTypeFromTypeNode(memberNode);
  const memberName = getTypeNodeName(memberNode, memberType, ctx.checker, ctx.ts);
  if (!memberName) {
    throw new Error(`GraphQL named union ${unionName} member requires a type name`);
  }
  const memberBase = findUnionMemberBaseType(
    nonNullishBaseTypes,
    memberNode,
    index,
    ctx.checker,
    ctx.ts,
  );
  return {
    name: memberName,
    type: await enrichGraphqlTypeInfo(memberBase, memberType, memberNode, ctx),
  };
};

/** @throws {Error} */
const tryEnrichNamedUnionTypeInfo = async (
  base: TypeInfo & { kind: 'union' },
  tsType: TSType,
  typeNode: TSTypeNode | undefined,
  unionTypeNode: import('typescript').UnionTypeNode | undefined,
  ctx: EnrichTypeContext,
): Promise<GraphqlOutputTypeInfo | undefined> => {
  const nullable = base.types.some(isNullishTypeInfo);
  const nonNullishBaseTypes = base.types.filter((t) => !isNullishTypeInfo(t));
  const nonNullishTypeNodes = unionTypeNode?.types.filter(
    (node) => !isNullishTypeNode(node, ctx.ts),
  );
  if (!isNamedObjectUnion(unionTypeNode, nonNullishBaseTypes, nonNullishTypeNodes)) {
    return undefined;
  }
  const unionName = getTypeNodeName(typeNode, tsType, ctx.checker, ctx.ts);
  if (!unionName || !nonNullishTypeNodes) return undefined;
  const members = await Promise.all(
    nonNullishTypeNodes.map((memberNode, index) =>
      enrichNamedUnionMember(unionName, memberNode, index, nonNullishBaseTypes, ctx),
    ),
  );
  return { kind: 'graphqlNamedUnion', name: unionName, nullable, members };
};

/** @throws {Error} */
const enrichFallbackUnionTypeInfo = async (
  base: TypeInfo & { kind: 'union' },
  tsType: TSType,
  unionTypeNode: import('typescript').UnionTypeNode,
  ctx: EnrichTypeContext,
): Promise<GraphqlOutputTypeInfo> => {
  const enrichedTypes = await Promise.all(
    base.types.map((memberBase, index) => {
      const memberNode = findUnionMemberTypeNode(
        unionTypeNode.types,
        memberBase,
        index,
        ctx.checker,
        ctx.ts,
      );
      const memberType = memberNode ? ctx.checker.getTypeFromTypeNode(memberNode) : tsType;
      return enrichGraphqlTypeInfo(memberBase, memberType, memberNode, ctx);
    }),
  );
  return { ...base, types: enrichedTypes };
};

/** @throws {Error} */
const enrichUnionTypeInfo = async (
  base: TypeInfo & { kind: 'union' },
  tsType: TSType,
  typeNode: TSTypeNode | undefined,
  ctx: EnrichTypeContext,
): Promise<GraphqlOutputTypeInfo> => {
  const unionTypeNode = getUnionTypeNode(typeNode, ctx.checker, ctx.ts);
  const namedUnion = await tryEnrichNamedUnionTypeInfo(base, tsType, typeNode, unionTypeNode, ctx);
  if (namedUnion) return namedUnion;
  return unionTypeNode ? enrichFallbackUnionTypeInfo(base, tsType, unionTypeNode, ctx) : base;
};

/** @throws {Error} */
const getMethodTypeNames = async (
  classNode: TSClassDeclaration,
  methodName: string,
  checker: TSTypeChecker,
  ts: TS,
  baseReturnType: TypeInfo,
  options: GenerateSdlOptions,
): Promise<MethodTypeNames> => {
  const methodNode = findMethodDeclaration(classNode, methodName, ts);
  const signature = methodNode ? checker.getSignatureFromDeclaration(methodNode) : undefined;
  if (!methodNode || !signature) {
    return {
      returnTypeName: undefined,
      parentTypeName: undefined,
      argsSchemaRef: undefined,
      returnType: undefined,
    };
  }

  const tsReturnType = signature.getReturnType();
  const returnTypeName = getNamedTypeFromTsType(tsReturnType, checker, ts);
  const firstParam = signature.getParameters()[0];
  const parentTypeName = firstParam
    ? getNamedTypeFromTsType(checker.getTypeOfSymbol(firstParam), checker, ts)
    : undefined;
  const argsSchemaRef = extractGraphqlArgsRef(methodNode, classNode.getSourceFile(), ts);
  const returnType = await enrichGraphqlTypeInfo(baseReturnType, tsReturnType, methodNode.type, {
    sourceFile: classNode.getSourceFile(),
    checker,
    ts,
    options,
  });

  return { returnTypeName, parentTypeName, argsSchemaRef, returnType };
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
      await getMethodTypeNames(
        found.classNode,
        method.name,
        found.checker,
        found.ts,
        method.returnType,
        options,
      ),
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
  type: GraphqlOutputTypeInfo,
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

const buildRuntimeScalarRefs = (
  ctx: ReturnType<typeof createGraphqlTypeContext>,
): NonNullable<GeneratedGraphqlRuntime['scalarRefs']> => {
  const scalarRefs: NonNullable<GeneratedGraphqlRuntime['scalarRefs']> = {};
  for (const [typeName, definition] of ctx.scalars.entries()) {
    scalarRefs[typeName] = definition.ref;
  }
  return scalarRefs;
};

const buildRuntimeScalars = (
  ctx: ReturnType<typeof createGraphqlTypeContext>,
): NonNullable<GeneratedGraphqlRuntime['scalars']> => {
  const scalars: NonNullable<GeneratedGraphqlRuntime['scalars']> = {};
  for (const [typeName, definition] of ctx.scalars.entries()) {
    scalars[typeName] = definition.scalar;
  }
  return scalars;
};

const buildRuntimeUnions = (
  ctx: ReturnType<typeof createGraphqlTypeContext>,
): RuntimeUnionFields => {
  const unions: RuntimeUnionFields = {};
  for (const [typeName, fields] of ctx.unionFields.entries()) {
    unions[typeName] = Object.fromEntries(
      [...fields.entries()].map(([memberName, memberFields]) => [memberName, [...memberFields]]),
    );
  }
  return unions;
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
  returnType: GraphqlOutputTypeInfo,
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
  returnType: GraphqlOutputTypeInfo,
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
  returnType: GraphqlOutputTypeInfo,
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

const buildInspectOptions = (
  options: GenerateSdlOptions,
): Parameters<typeof getTypeMetadata>[1] => ({
  ...(options.tsconfig ? { tsconfig: options.tsconfig } : {}),
  expandStrategy: 'always',
});

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const registerAnalyzedMethod = async (
  method: MethodInfo,
  resolverName: string,
  state: AnalysisState,
  methodTypeNames: ReadonlyMap<string, MethodTypeNames>,
  options: GenerateSdlOptions,
): Promise<void> => {
  if (typeof method.name !== 'string') return;
  const operation = getOperationMetadata(method);
  if (!operation) return;
  const names = methodTypeNames.get(method.name);
  const argsRendered = await renderMethodArgs(names, resolverName, method.name, options);
  registerResolverMethod(
    state,
    resolverName,
    method.name,
    operation.fieldName ?? method.name,
    names?.returnType ?? method.returnType,
    operation.kind,
    names,
    argsRendered,
  );
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const analyzeResolver = async (
  resolver: GraphqlResolverClass,
  state: AnalysisState,
  options: GenerateSdlOptions,
): Promise<void> => {
  const metadataResult = await getTypeMetadata(
    toInspectableClass(resolver),
    buildInspectOptions(options),
  );
  if (metadataResult.isErr()) {
    const err = metadataResult.error;
    throw new Error(`Failed to inspect GraphQL resolver ${resolver.name}: ${err.message}`);
  }

  const metadata = metadataResult.value;
  const methodTypeNames = await getResolverTypeNames(resolver, metadata, options);

  for (const method of metadata.methods) {
    await registerAnalyzedMethod(method, resolver.name, state, methodTypeNames, options);
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
      scalarRefs: buildRuntimeScalarRefs(state.typeCtx),
      scalars: buildRuntimeScalars(state.typeCtx),
      unions: buildRuntimeUnions(state.typeCtx),
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
