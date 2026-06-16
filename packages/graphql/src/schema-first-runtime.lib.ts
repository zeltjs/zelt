import { dirname, resolve } from 'node:path';

import type { ClassMetadata, MethodInfo } from '@zeltjs/decorator-metadata/inspect';
import { getOrCreateProgram, getTypeMetadata } from '@zeltjs/decorator-metadata/inspect';
import type { ObjectTypeDefinitionNode } from 'graphql';
import { Kind, parse } from 'graphql';

import type { GraphqlArgsSchemaRef } from './analyze-gql-args.lib';
import { extractGraphqlArgsRef } from './analyze-gql-args.lib';
import type { GraphqlOperationMetadata, GraphqlResolverClass } from './graphql-metadata.lib';
import type {
  GeneratedGraphqlBinding,
  GraphqlInvocationHook,
  GraphqlRuntimeManifest,
} from './graphql-runtime.lib';
import { createGeneratedGraphqlArgsInvocationHook } from './graphql-sdl-generator.lib';

type SchemaFirstRuntimeOptions = {
  readonly schemaSdl: string;
  readonly tsconfig?: string;
};

type TS = typeof import('typescript');
type TSClassDeclaration = import('typescript').ClassDeclaration;
type TSMethodDeclaration = import('typescript').MethodDeclaration;
type TSSourceFile = import('typescript').SourceFile;
type TSCallExpression = import('typescript').CallExpression;
type TSExpression = import('typescript').Expression;
type TSImportDeclaration = import('typescript').ImportDeclaration;

type SchemaFirstSdlIndex = {
  readonly queryFields: ReadonlySet<string>;
  readonly mutationFields: ReadonlySet<string>;
  readonly objectFields: ReadonlyMap<string, ReadonlySet<string>>;
};

type RuntimeBindings = GraphqlRuntimeManifest['bindings'];

type RuntimeInvocationHooks = Record<string, GraphqlInvocationHook>;

type ResolverClassNode = {
  readonly classNode: TSClassDeclaration;
  readonly ts: TS;
};

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

const resolveRelativeModuleSpecifier = (sourceFile: TSSourceFile, specifier: string): string => {
  if (!specifier.startsWith('.')) return specifier;
  const resolved = resolve(dirname(sourceFile.fileName), specifier);
  return resolved.endsWith('.ts') || resolved.endsWith('.js') || resolved.endsWith('.mjs')
    ? resolved
    : `${resolved}.ts`;
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
  importDecl: TSImportDeclaration,
  localName: string,
  ts: TS,
): string | undefined => {
  const namedBindings = importDecl.importClause?.namedBindings;
  if (!namedBindings || !ts.isNamedImports(namedBindings)) return undefined;
  return findExportNameInElements(namedBindings.elements, localName);
};

const findIdentifierImport = (
  sourceFile: TSSourceFile,
  localName: string,
  ts: TS,
): GraphqlArgsSchemaRef | undefined => {
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

const getExportedVariableDeclarations = (
  stmt: import('typescript').Statement,
  ts: TS,
): readonly import('typescript').VariableDeclaration[] | undefined => {
  if (!ts.isVariableStatement(stmt)) return undefined;
  const isExported = stmt.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
  return isExported ? stmt.declarationList.declarations : undefined;
};

const hasExportedLocalDeclaration = (
  sourceFile: TSSourceFile,
  identifierName: string,
  ts: TS,
): boolean => {
  for (const stmt of sourceFile.statements) {
    const declarations = getExportedVariableDeclarations(stmt, ts);
    if (!declarations) continue;
    if (
      declarations.some((decl) => ts.isIdentifier(decl.name) && decl.name.text === identifierName)
    ) {
      return true;
    }
  }
  return false;
};

const buildSchemaRef = (
  call: TSCallExpression,
  sourceFile: TSSourceFile,
  ts: TS,
): GraphqlArgsSchemaRef | undefined => {
  const arg = call.arguments[0];
  if (!arg || !ts.isIdentifier(arg)) return undefined;
  const localName = arg.text;

  const imported = findIdentifierImport(sourceFile, localName, ts);
  if (imported) return imported;
  if (hasExportedLocalDeclaration(sourceFile, localName, ts)) {
    return { modulePath: sourceFile.fileName, exportName: localName };
  }
  return undefined;
};

const matchPropertyAccess = (
  expression: TSExpression | undefined,
  propertyName: string,
  ts: TS,
): TSExpression | undefined => {
  if (expression === undefined || !ts.isPropertyAccessExpression(expression)) return undefined;
  return expression.name.text === propertyName ? expression.expression : undefined;
};

const matchSchemaFirstArgsCall = (
  init: import('typescript').Expression | undefined,
  rootTypeName: 'Query' | 'Mutation',
  fieldName: string,
  ts: TS,
): TSCallExpression | undefined => {
  if (!init || !ts.isCallExpression(init)) return undefined;
  const fieldAccess = matchPropertyAccess(init.expression, 'args', ts);
  const rootAccess = matchPropertyAccess(fieldAccess, fieldName, ts);
  const gqlIdentifier = matchPropertyAccess(rootAccess, rootTypeName, ts);
  if (gqlIdentifier === undefined || !ts.isIdentifier(gqlIdentifier)) return undefined;
  if (gqlIdentifier.text !== 'Gql') return undefined;
  return init;
};

/** @throws {Error} */
const extractSchemaFirstGraphqlArgsRef = (
  methodNode: TSMethodDeclaration,
  sourceFile: TSSourceFile,
  rootTypeName: 'Query' | 'Mutation',
  fieldName: string,
  ts: TS,
): GraphqlArgsSchemaRef | undefined => {
  for (const param of methodNode.parameters) {
    const call = matchSchemaFirstArgsCall(param.initializer, rootTypeName, fieldName, ts);
    if (!call) continue;
    const ref = buildSchemaRef(call, sourceFile, ts);
    if (!ref) {
      const paramName = ts.isIdentifier(param.name) ? param.name.text : '<unknown>';
      throw new Error(
        `Gql.${rootTypeName}.${fieldName}.args() detected on parameter '${paramName}' but schema reference could not be resolved`,
      );
    }
    return ref;
  }
  return undefined;
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
const findResolverClassNode = async (
  resolver: GraphqlResolverClass,
  metadata: ClassMetadata,
  options: SchemaFirstRuntimeOptions,
): Promise<ResolverClassNode | undefined> => {
  if (!metadata.pos) return undefined;

  const programResult = await getOrCreateProgram(resolve(options.tsconfig ?? 'tsconfig.json'));
  if (programResult.isErr()) {
    throw new Error(`Failed to load TypeScript program: ${programResult.error.message}`);
  }

  const { program, ts } = programResult.value;
  const sourceFile = program.getSourceFile(metadata.pos.sourceFile);
  if (!sourceFile) return undefined;

  const classNode = findClassDeclaration(sourceFile, resolver.name, ts);
  return classNode ? { classNode, ts } : undefined;
};

const getRootTypeName = (
  kind: GraphqlOperationMetadata['kind'],
): 'Query' | 'Mutation' | undefined => {
  if (kind === 'query') return 'Query';
  if (kind === 'mutation') return 'Mutation';
  return undefined;
};

/** @throws {Error} */
const getMethodArgsSchemaRef = (
  found: ResolverClassNode | undefined,
  methodName: string,
  operation: GraphqlOperationMetadata,
): GraphqlArgsSchemaRef | undefined => {
  if (!found) return undefined;
  const methodNode = findMethodDeclaration(found.classNode, methodName, found.ts);
  if (!methodNode) return undefined;
  const rootTypeName = getRootTypeName(operation.kind);
  if (rootTypeName !== undefined) {
    const schemaFirstRef = extractSchemaFirstGraphqlArgsRef(
      methodNode,
      found.classNode.getSourceFile(),
      rootTypeName,
      operation.fieldName ?? methodName,
      found.ts,
    );
    if (schemaFirstRef) return schemaFirstRef;
  }
  return extractGraphqlArgsRef(methodNode, found.classNode.getSourceFile(), found.ts);
};

const getRootFields = (
  index: SchemaFirstSdlIndex,
  rootTypeName: 'Query' | 'Mutation',
): ReadonlySet<string> => (rootTypeName === 'Query' ? index.queryFields : index.mutationFields);

/** @throws {Error} */
const addRuntimeBinding = (
  bindings: RuntimeBindings,
  typeName: string,
  fieldName: string,
  binding: GeneratedGraphqlBinding,
): void => {
  const typeBindings = bindings[typeName] ?? {};
  const existing = typeBindings[fieldName];
  if (
    existing &&
    (existing.resolver !== binding.resolver ||
      existing.method !== binding.method ||
      existing.hook !== binding.hook)
  ) {
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
const registerRootOperation = (
  bindings: RuntimeBindings,
  invocationHooks: RuntimeInvocationHooks,
  fields: ReadonlySet<string>,
  rootTypeName: 'Query' | 'Mutation',
  resolverName: string,
  methodName: string,
  fieldName: string,
  argsSchemaRef: GraphqlArgsSchemaRef | undefined,
): void => {
  requireRootField(fields, rootTypeName, fieldName);
  const hook = argsSchemaRef === undefined ? undefined : `${rootTypeName}.${fieldName}`;
  const binding = {
    resolver: resolverName,
    method: methodName,
    ...(hook !== undefined && { hook }),
  };
  addRuntimeBinding(bindings, rootTypeName, fieldName, binding);
  if (hook === undefined || argsSchemaRef === undefined) return;
  invocationHooks[hook] = createGeneratedGraphqlArgsInvocationHook(argsSchemaRef);
};

/** @throws {Error} */
const registerOperation = (
  bindings: RuntimeBindings,
  invocationHooks: RuntimeInvocationHooks,
  index: SchemaFirstSdlIndex,
  resolverName: string,
  methodName: string,
  operation: GraphqlOperationMetadata,
  argsSchemaRef: GraphqlArgsSchemaRef | undefined,
): void => {
  const fieldName = operation.fieldName ?? methodName;
  const rootTypeName = getRootTypeName(operation.kind);
  if (rootTypeName !== undefined) {
    registerRootOperation(
      bindings,
      invocationHooks,
      getRootFields(index, rootTypeName),
      rootTypeName,
      resolverName,
      methodName,
      fieldName,
      argsSchemaRef,
    );
    return;
  }
  const binding = { resolver: resolverName, method: methodName };
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
  invocationHooks: RuntimeInvocationHooks,
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
  const found = await findResolverClassNode(resolver, metadata, options);
  for (const method of metadata.methods) {
    if (typeof method.name !== 'string') continue;
    const operation = getOperationMetadata(method);
    if (!operation) continue;
    registerOperation(
      bindings,
      invocationHooks,
      index,
      resolver.name,
      method.name,
      operation,
      getMethodArgsSchemaRef(found, method.name, operation),
    );
  }
};

/** @throws {Error | UnsupportedTypeScriptVersionError} */
export const generateSchemaFirstGraphqlRuntimeForResolvers = async (
  resolvers: readonly GraphqlResolverClass[],
  options: SchemaFirstRuntimeOptions,
): Promise<GraphqlRuntimeManifest> => {
  const index = buildSdlIndex(options.schemaSdl);
  const bindings: RuntimeBindings = {};
  const invocationHooks: RuntimeInvocationHooks = {};
  for (const resolver of resolvers) {
    await registerResolver(bindings, invocationHooks, index, resolver, options);
  }
  requireRootBindings(index.queryFields, bindings, 'Query');
  requireRootBindings(index.mutationFields, bindings, 'Mutation');
  return {
    schemaSdl: options.schemaSdl,
    bindings,
    ...(Object.keys(invocationHooks).length > 0 && { invocationHooks }),
  };
};
