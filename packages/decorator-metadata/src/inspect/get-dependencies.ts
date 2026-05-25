import { resolve } from 'node:path';

import type { ResultAsync } from 'neverthrow';
import { errAsync, okAsync } from 'neverthrow';

import { resolvePosition } from '../runtime/position';
import { getInternalClassMetadata } from '../runtime/store';
import type { ProgramCacheError } from './program-cache';
import { getOrCreateProgram } from './program-cache';
import type { DependencyInfo, GetDependenciesOptions, InspectError } from './types';

type TypeScriptModule = typeof import('typescript');
type TSSourceFile = import('typescript').SourceFile;
type TSClassDeclaration = import('typescript').ClassDeclaration;
type TSNode = import('typescript').Node;
type TSTypeChecker = import('typescript').TypeChecker;

const DEFAULT_TSCONFIG = './tsconfig.json';

const findClassAtPosition = (
  sourceFile: TSSourceFile,
  pos: number,
  ts: TypeScriptModule,
): TSClassDeclaration | undefined => {
  const find = (node: TSNode): TSClassDeclaration | undefined => {
    if (ts.isClassDeclaration(node) && node.pos <= pos && pos < node.end) {
      return node;
    }
    return ts.forEachChild(node, find);
  };
  return find(sourceFile);
};

// When the decorator factory is stored in a variable before being applied,
// the trace points to the factory call site rather than the class declaration.
// Fall back to name-based lookup to handle that pattern.
const findClassByName = (
  sourceFile: TSSourceFile,
  name: string,
  ts: TypeScriptModule,
): TSClassDeclaration | undefined => {
  const find = (node: TSNode): TSClassDeclaration | undefined => {
    if (ts.isClassDeclaration(node) && node.name !== undefined && node.name.text === name) {
      return node;
    }
    return ts.forEachChild(node, find);
  };
  return find(sourceFile);
};

const hasConfigDecoratorOnClass = (
  decl: import('typescript').Declaration,
  ts: TypeScriptModule,
): boolean => {
  if (!ts.isClassDeclaration(decl)) return false;
  return (
    decl.modifiers?.some((m) => {
      if (!ts.isDecorator(m)) return false;
      const expr = m.expression;
      return ts.isIdentifier(expr) && expr.text === 'Config';
    }) ?? false
  );
};

const findModuleSpecifier = (
  sourceFile: TSSourceFile,
  identifierName: string,
  ts: TypeScriptModule,
): string => {
  const importDecl = sourceFile.statements.find((stmt) => {
    if (!ts.isImportDeclaration(stmt)) return false;
    const namedBindings = stmt.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) return false;
    return namedBindings.elements.some((e) => e.name.text === identifierName);
  });
  if (!importDecl || !ts.isImportDeclaration(importDecl)) return '';
  if (!ts.isStringLiteral(importDecl.moduleSpecifier)) return '';
  return importDecl.moduleSpecifier.text;
};

const extractDepFromParam = (
  param: import('typescript').ParameterDeclaration,
  ts: TypeScriptModule,
  checker: TSTypeChecker,
  sourceFile: TSSourceFile,
): DependencyInfo | undefined => {
  if (!param.initializer || !ts.isCallExpression(param.initializer)) return undefined;

  const callExpr = param.initializer;
  const callee = callExpr.expression;
  if (!ts.isIdentifier(callee) || callee.text !== 'inject') return undefined;

  const arg = callExpr.arguments[0];
  if (!arg || !ts.isIdentifier(arg)) return undefined;

  const symbol = checker.getSymbolAtLocation(arg);
  if (!symbol) return undefined;

  const decl = symbol.getDeclarations()?.[0];
  if (!decl) return undefined;

  return {
    className: arg.text,
    sourceFile: decl.getSourceFile().fileName,
    moduleSpecifier: findModuleSpecifier(sourceFile, arg.text, ts),
    hasConfigDecorator: hasConfigDecoratorOnClass(decl, ts),
  };
};

const extractInjectCalls = (
  classNode: TSClassDeclaration,
  ts: TypeScriptModule,
  checker: TSTypeChecker,
  sourceFile: TSSourceFile,
): DependencyInfo[] => {
  const ctor = classNode.members.find((m) => ts.isConstructorDeclaration(m));
  if (!ctor || !ts.isConstructorDeclaration(ctor)) {
    return [];
  }

  return ctor.parameters.flatMap((param) => {
    const dep = extractDepFromParam(param, ts, checker, sourceFile);
    return dep ? [dep] : [];
  });
};

export const getDependencies = (
  cls: new (...args: never[]) => unknown,
  options?: GetDependenciesOptions,
): ResultAsync<readonly DependencyInfo[], InspectError | ProgramCacheError> => {
  const storedMeta = getInternalClassMetadata(cls);
  if (!storedMeta) {
    return errAsync({
      code: 'NO_METADATA',
      message: `No decorator metadata found for class ${cls.name}`,
    });
  }

  const storedPos = resolvePosition(storedMeta.trace);
  if (!storedPos) {
    return errAsync({
      code: 'POSITION_INVALID',
      message: `No source position captured for class ${cls.name}`,
    });
  }

  const tsconfigPath = resolve(options?.tsconfig ?? DEFAULT_TSCONFIG);

  return getOrCreateProgram(tsconfigPath).andThen((cached) => {
    const { program, checker, ts } = cached;

    const sourceFile = program.getSourceFile(storedPos.sourceFile);
    if (!sourceFile) {
      return errAsync<readonly DependencyInfo[], InspectError>({
        code: 'SOURCE_NOT_FOUND',
        message: `Source file not found: ${storedPos.sourceFile}`,
      });
    }

    const pos = ts.getPositionOfLineAndCharacter(
      sourceFile,
      storedPos.line - 1,
      storedPos.column - 1,
    );

    const classNode =
      findClassAtPosition(sourceFile, pos, ts) ?? findClassByName(sourceFile, cls.name, ts);
    if (!classNode || !ts.isClassDeclaration(classNode)) {
      return errAsync<readonly DependencyInfo[], InspectError>({
        code: 'POSITION_INVALID',
        message: `No class found at position ${storedPos.line}:${storedPos.column} or by name ${cls.name}`,
      });
    }

    const deps = extractInjectCalls(classNode, ts, checker, sourceFile);
    return okAsync(deps);
  });
};
