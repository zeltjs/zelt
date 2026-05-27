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

const namedImportContains = (
  importDecl: TSImportDeclaration,
  identifierName: string,
  ts: TypeScriptModule,
): boolean => {
  const namedBindings = importDecl.importClause?.namedBindings;
  if (!namedBindings || !ts.isNamedImports(namedBindings)) return false;
  return namedBindings.elements.some((elem) => elem.name.text === identifierName);
};

const findIdentifierImportModule = (
  sourceFile: TSSourceFile,
  identifierName: string,
  ts: TypeScriptModule,
): string | undefined => {
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (!namedImportContains(stmt, identifierName, ts)) continue;
    return resolveRelativeModuleSpecifier(sourceFile, stmt.moduleSpecifier.text);
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
  const exportName = arg.text;
  const target = extractTarget(call, ts);

  const importedModule = findIdentifierImportModule(sourceFile, exportName, ts);
  if (importedModule) {
    return { kind: 'valibot-named', modulePath: importedModule, exportName, target };
  }
  if (hasLocalIdentifierDeclaration(sourceFile, exportName, ts)) {
    return { kind: 'valibot-named', modulePath: sourceFile.fileName, exportName, target };
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
