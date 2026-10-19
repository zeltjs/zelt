import { resolve } from 'node:path';

import type { ResultAsync } from 'neverthrow';
import { errAsync, okAsync } from 'neverthrow';

import { getInternalClassMetadata } from '../runtime/index';
import { findClassByName, getDecoratorName } from './ast.lib';
import { resolveClassDeclaration } from './class-declaration.lib';
import type { DependencyInfo, GetDependenciesOptions, InspectError } from './inspect.types';
import type { CachedProgram, ProgramCacheError } from './program-cache.lib';
import { getOrCreateProgram } from './program-cache.lib';

type TypeScriptModule = typeof import('typescript');
type TSSourceFile = import('typescript').SourceFile;
type TSClassDeclaration = import('typescript').ClassDeclaration;
type TSTypeChecker = import('typescript').TypeChecker;

const DEFAULT_TSCONFIG = './tsconfig.json';
const CONFIG_DECORATOR_NAME = 'Config';

const isConfigDecorator = (expr: import('typescript').Expression, ts: TypeScriptModule): boolean =>
  getDecoratorName(expr, ts) === CONFIG_DECORATOR_NAME;

const hasConfigDecoratorOnClass = (
  decl: import('typescript').Declaration,
  ts: TypeScriptModule,
): boolean => {
  if (!ts.isClassDeclaration(decl)) return false;
  return (
    decl.modifiers?.some((m) => ts.isDecorator(m) && isConfigDecorator(m.expression, ts)) ?? false
  );
};

const getClassDecoratorNames = (
  decl: import('typescript').Declaration,
  ts: TypeScriptModule,
): readonly string[] => {
  if (!ts.isClassDeclaration(decl)) return [];
  return (decl.modifiers ?? []).flatMap((m) => {
    if (!ts.isDecorator(m)) return [];
    const name = getDecoratorName(m.expression, ts);
    return name === undefined ? [] : [name];
  });
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

const classDeclarationFromSymbol = (
  symbol: import('typescript').Symbol,
  ts: TypeScriptModule,
  checker: TSTypeChecker,
): import('typescript').ClassDeclaration | undefined => {
  const resolved =
    (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
  return resolved.getDeclarations()?.find((d) => ts.isClassDeclaration(d)) as
    | import('typescript').ClassDeclaration
    | undefined;
};

const extractDepFromParam = (
  param: import('typescript').ParameterDeclaration,
  ts: TypeScriptModule,
  checker: TSTypeChecker,
  sourceFile: TSSourceFile,
): DependencyInfo | undefined => {
  if (!param.initializer || !ts.isCallExpression(param.initializer)) return undefined;

  const callee = param.initializer.expression;
  if (!ts.isIdentifier(callee) || callee.text !== 'inject') return undefined;

  const arg = param.initializer.arguments[0];
  if (!arg || !ts.isIdentifier(arg)) return undefined;

  const symbol = checker.getSymbolAtLocation(arg);
  if (!symbol) return undefined;

  const decl = classDeclarationFromSymbol(symbol, ts, checker);
  if (!decl) return undefined;

  return {
    className: arg.text,
    sourceFile: decl.getSourceFile().fileName,
    moduleSpecifier: findModuleSpecifier(sourceFile, arg.text, ts),
    hasConfigDecorator: hasConfigDecoratorOnClass(decl, ts),
    decorators: getClassDecoratorNames(decl, ts),
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

/**
 * getDependencies と getDependenciesFromSource は「sourceFile 解決 → classNode 解決 →
 * inject() 抽出」のボイラープレートを共有するため、classNode の探し方だけを差し替え可能にしている。
 */
const resolveClassNodeAndExtract = (
  cached: CachedProgram,
  sourceFilePath: string,
  findClassNode: (sourceFile: TSSourceFile, ts: TypeScriptModule) => TSClassDeclaration | undefined,
  positionErrorMessage: string,
): ResultAsync<readonly DependencyInfo[], InspectError> => {
  const { program, checker, ts } = cached;

  const sourceFile = program.getSourceFile(sourceFilePath);
  if (!sourceFile) {
    return errAsync({
      code: 'SOURCE_NOT_FOUND',
      message: `Source file not found: ${sourceFilePath}`,
    });
  }

  const classNode = findClassNode(sourceFile, ts);
  if (!classNode) {
    return errAsync({
      code: 'POSITION_INVALID',
      message: positionErrorMessage,
    });
  }

  return okAsync(extractInjectCalls(classNode, ts, checker, sourceFile));
};

/** @throws {UnsupportedTypeScriptVersionError} */
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

  const tsconfigPath = resolve(options?.tsconfig ?? DEFAULT_TSCONFIG);
  return getOrCreateProgram(tsconfigPath).andThen((cached) => {
    const declaration = resolveClassDeclaration(cls, storedMeta.trace, cached);
    if (declaration.isErr()) return errAsync(declaration.error);
    return okAsync(
      extractInjectCalls(
        declaration.value.node,
        cached.ts,
        cached.checker,
        declaration.value.node.getSourceFile(),
      ),
    );
  });
};

/** @throws {UnsupportedTypeScriptVersionError} */
export const getDependenciesFromSource = (
  sourceFilePath: string,
  className: string,
  options?: GetDependenciesOptions,
): ResultAsync<readonly DependencyInfo[], InspectError | ProgramCacheError> => {
  const tsconfigPath = resolve(options?.tsconfig ?? DEFAULT_TSCONFIG);

  return getOrCreateProgram(tsconfigPath).andThen((cached) =>
    resolveClassNodeAndExtract(
      cached,
      sourceFilePath,
      (sourceFile, ts) => findClassByName(sourceFile, className, ts),
      `No class named ${className} in ${sourceFilePath}`,
    ),
  );
};
