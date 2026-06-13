import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { GraphqlArg, GraphqlSchemaAdapter } from './json-schema-to-graphql-args.lib';
import { jsonSchemaToGraphqlArgs } from './json-schema-to-graphql-args.lib';

type TS = typeof import('typescript');
type TSSourceFile = import('typescript').SourceFile;
type TSMethodDeclaration = import('typescript').MethodDeclaration;
type TSCallExpression = import('typescript').CallExpression;
type TSImportDeclaration = import('typescript').ImportDeclaration;

export type GqlValidatedSchemaRef = {
  readonly modulePath: string;
  readonly exportName: string;
};

// Caller-supplied module loader, same contract as @zeltjs/openapi's
// SchemaResolver: required when the schema module is a `.ts` file that the
// calling runtime (vitest, tsx) can resolve through its loader but Node.js's
// bare `import()` cannot.
export type GqlSchemaResolver = (modulePath: string) => Promise<Record<string, unknown>>;

const toImportSpecifier = (modulePath: string): string => {
  if (modulePath.startsWith('file:')) return modulePath;
  if (isAbsolute(modulePath) || modulePath.startsWith('./') || modulePath.startsWith('../')) {
    return pathToFileURL(modulePath).href;
  }
  return modulePath;
};

/** @throws {Error} */
const defaultSchemaResolver: GqlSchemaResolver = async (modulePath) => {
  const imported: unknown = await import(toImportSpecifier(modulePath));
  if (typeof imported !== 'object' || imported === null) {
    throw new Error(`Module '${modulePath}' did not resolve to an object`);
  }
  return { ...imported };
};

const resolveRelativeModuleSpecifier = (sourceFile: TSSourceFile, specifier: string): string => {
  if (!specifier.startsWith('.')) return specifier;
  const baseDir = dirname(sourceFile.fileName);
  const resolved = resolve(baseDir, specifier);
  return resolved.endsWith('.ts') || resolved.endsWith('.js') ? resolved : `${resolved}.ts`;
};

// `import { Foo as Bar } from './x'; gqlValidated(Bar)` must dynamic-import
// `Foo` from `./x`, not `Bar`.
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
): GqlValidatedSchemaRef | undefined => {
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

const hasExportedLocalDeclaration = (
  sourceFile: TSSourceFile,
  identifierName: string,
  ts: TS,
): boolean => {
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const hasExportModifier = stmt.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!hasExportModifier) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === identifierName) return true;
    }
  }
  return false;
};

const buildSchemaRef = (
  call: TSCallExpression,
  sourceFile: TSSourceFile,
  ts: TS,
): GqlValidatedSchemaRef | undefined => {
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

const matchGqlValidatedCall = (
  init: import('typescript').Expression | undefined,
  ts: TS,
): TSCallExpression | undefined => {
  if (!init || !ts.isCallExpression(init)) return undefined;
  if (!ts.isIdentifier(init.expression)) return undefined;
  if (init.expression.text !== 'gqlValidated') return undefined;
  return init;
};

export const extractGqlValidatedRef = (
  methodNode: TSMethodDeclaration,
  sourceFile: TSSourceFile,
  ts: TS,
): GqlValidatedSchemaRef | undefined => {
  for (const param of methodNode.parameters) {
    const call = matchGqlValidatedCall(param.initializer, ts);
    if (call) return buildSchemaRef(call, sourceFile, ts);
  }
  return undefined;
};

/** @throws {Error} when the module cannot be imported, the export is missing, or the schema is unsupported */
export const resolveGqlValidatedArgs = async (
  ref: GqlValidatedSchemaRef,
  adapter: GraphqlSchemaAdapter,
  resolver: GqlSchemaResolver = defaultSchemaResolver,
): Promise<readonly GraphqlArg[]> => {
  const mod = await resolver(ref.modulePath);
  const value = mod[ref.exportName];
  if (value === undefined) {
    throw new Error(`Export '${ref.exportName}' not found in module '${ref.modulePath}'`);
  }
  return jsonSchemaToGraphqlArgs(adapter.toJsonSchema(value));
};
