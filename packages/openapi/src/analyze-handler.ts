import { dirname, resolve } from 'node:path';

import type { Position } from '@zeltjs/decorator-metadata/inspect';

type TypeScriptModule = typeof import('typescript');
type TSProgram = import('typescript').Program;
type TSSourceFile = import('typescript').SourceFile;
type TSParameterDeclaration = import('typescript').ParameterDeclaration;
type TSCallExpression = import('typescript').CallExpression;
type TSImportDeclaration = import('typescript').ImportDeclaration;

export type ValidationTarget = 'json' | 'form';

export type RequestSchemaRef =
  | {
      kind: 'valibot-named';
      readonly modulePath: string;
      readonly exportName: string;
      readonly target: ValidationTarget;
    }
  | { kind: 'none' };

const findParameterAtPosition = (
  sourceFile: TSSourceFile,
  offset: number,
  ts: TypeScriptModule,
): TSParameterDeclaration | undefined => {
  const visit = (node: import('typescript').Node): TSParameterDeclaration | undefined => {
    if (node.getStart() === offset && ts.isParameter(node)) return node;
    return ts.forEachChild(node, visit);
  };
  return visit(sourceFile);
};

const extractTarget = (expr: TSCallExpression, ts: TypeScriptModule): ValidationTarget => {
  const arg = expr.arguments[1];
  if (!arg || !ts.isStringLiteral(arg)) return 'json';
  return arg.text === 'form' ? 'form' : 'json';
};

const resolveRelativeModuleSpecifier = (sourceFile: TSSourceFile, specifier: string): string => {
  if (!specifier.startsWith('.')) return specifier;
  const baseDir = dirname(sourceFile.fileName);
  const resolved = resolve(baseDir, specifier);
  return resolved.endsWith('.ts') || resolved.endsWith('.js') ? resolved : `${resolved}.ts`;
};

// `import { Foo as Bar } from './x'; validated(Bar)` must dynamic-import `Foo`
// from `./x`, not `Bar`. propertyName holds the original exported name when an
// alias is present; otherwise name itself is both local and exported.
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
  ts: TypeScriptModule,
): string | undefined => {
  const namedBindings = importDecl.importClause?.namedBindings;
  if (!namedBindings || !ts.isNamedImports(namedBindings)) return undefined;
  return findExportNameInElements(namedBindings.elements, localName);
};

type ResolvedImport = { readonly modulePath: string; readonly exportName: string };

const findIdentifierImport = (
  sourceFile: TSSourceFile,
  localName: string,
  ts: TypeScriptModule,
): ResolvedImport | undefined => {
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

const hasLocalIdentifierDeclaration = (
  sourceFile: TSSourceFile,
  identifierName: string,
  ts: TypeScriptModule,
): boolean => {
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === identifierName) return true;
    }
  }
  return false;
};

const buildValidatedRef = (
  call: TSCallExpression,
  sourceFile: TSSourceFile,
  ts: TypeScriptModule,
): RequestSchemaRef => {
  const arg = call.arguments[0];
  if (!arg || !ts.isIdentifier(arg)) return { kind: 'none' };
  const localName = arg.text;
  const target = extractTarget(call, ts);

  const imported = findIdentifierImport(sourceFile, localName, ts);
  if (imported) {
    return {
      kind: 'valibot-named',
      modulePath: imported.modulePath,
      exportName: imported.exportName,
      target,
    };
  }
  if (hasLocalIdentifierDeclaration(sourceFile, localName, ts)) {
    return {
      kind: 'valibot-named',
      modulePath: sourceFile.fileName,
      exportName: localName,
      target,
    };
  }
  return { kind: 'none' };
};

const matchValidatedCall = (
  init: import('typescript').Expression | undefined,
  ts: TypeScriptModule,
): TSCallExpression | undefined => {
  if (!init || !ts.isCallExpression(init)) return undefined;
  if (!ts.isIdentifier(init.expression)) return undefined;
  if (init.expression.text !== 'validated') return undefined;
  return init;
};

export const analyzeParamFromPosition = (
  program: TSProgram,
  ts: TypeScriptModule,
  pos: Position,
): RequestSchemaRef => {
  const sourceFile = program.getSourceFile(pos.sourceFile);
  if (!sourceFile) return { kind: 'none' };
  const offset = ts.getPositionOfLineAndCharacter(sourceFile, pos.line - 1, pos.column - 1);
  const param = findParameterAtPosition(sourceFile, offset, ts);
  if (!param) return { kind: 'none' };
  const call = matchValidatedCall(param.initializer, ts);
  if (!call) return { kind: 'none' };
  return buildValidatedRef(call, sourceFile, ts);
};
