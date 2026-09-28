import ts from 'typescript';

import type { ResolvedConfig } from './extract-config.lib';
import { compileGlobs } from './glob.lib';
import type { AnalysisScope, ClassRef, Span, ValueOrigin } from './plugin.types';

export type TestScopeConfig = {
  readonly files: readonly string[];
  readonly category: AnalysisScope['category'];
};

export type ResolvedScope = {
  readonly scope: AnalysisScope;
  readonly files: readonly ts.SourceFile[];
};

/** glob で指定した test の範囲を、Program に載っている実ファイルへ広げる */
export const resolveScopes = (
  program: ts.Program,
  _config: ResolvedConfig,
  relativePath: (fileName: string) => string,
  scopes: readonly TestScopeConfig[],
): readonly ResolvedScope[] =>
  scopes.map((scope) => {
    const match = compileGlobs(scope.files);
    const files = program
      .getSourceFiles()
      .filter((file) => !file.isDeclarationFile && match(relativePath(file.fileName)))
      .sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
    return { scope: { files: scope.files, category: scope.category }, files };
  });

/** 配信する TestIdentity / UnitSetup の ID。fixture と同じ `<path>:<行>` 形式 */
export const locationIdOf = (span: Span): string => `${span.filePath}:${span.startLine}`;

/** plugin をまたいで同じ呼出を指すための ID。位置だけから作るので受け渡しが要らない */
export const callIdOf = (span: Span): string => `call:${span.filePath}:${span.start}`;

export const unwrapExpression = (node: ts.Expression): ts.Expression => {
  if (
    ts.isAwaitExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return unwrapExpression(node.expression);
  }
  return node;
};

export type OriginContext = {
  readonly checker: ts.TypeChecker;
  readonly spanOf: (node: ts.Node) => Span;
  readonly relativePath: (fileName: string) => string;
};

export const classRefOf = (ctx: OriginContext, cls: ts.ClassDeclaration): ClassRef | null => {
  const name = cls.name?.text;
  if (name === undefined) return null;
  return { filePath: ctx.relativePath(cls.getSourceFile().fileName), name };
};

export const classDeclarationOf = (
  ctx: OriginContext,
  node: ts.Node | undefined,
): ts.ClassDeclaration | null => {
  if (node === undefined) return null;
  const symbol = ctx.checker.getSymbolAtLocation(node);
  if (symbol === undefined) return null;
  const resolved =
    (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? ctx.checker.getAliasedSymbol(symbol) : symbol;
  for (const declaration of resolved.declarations ?? []) {
    if (ts.isClassDeclaration(declaration)) return declaration;
  }
  return null;
};

/** `x = …` のうち、同じ binding へ書く代入だけを集める */
const assignmentsTo = (
  symbol: ts.Symbol,
  file: ts.SourceFile,
  checker: ts.TypeChecker,
): ts.Expression[] => {
  const found: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      checker.getSymbolAtLocation(node.left) === symbol
    ) {
      found.push(node.right);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
};

const unresolved = (reason: string): ValueOrigin => ({ kind: 'unresolved', reason });

/** 一段深い追跡。traceOrigin から渡すことで、枝ごとの helper を再帰から切り離す */
type TraceStep = (expression: ts.Expression, path: readonly string[], depth: number) => ValueOrigin;

const traceCallOrigin = (
  ctx: OriginContext,
  node: ts.CallExpression,
  path: readonly string[],
  depth: number,
  step: TraceStep,
): ValueOrigin => {
  const callee = unwrapExpression(node.expression);
  if (!ts.isPropertyAccessExpression(callee)) {
    return { kind: 'factory-result', factoryCall: callIdOf(ctx.spanOf(node)), path };
  }
  // `t.get(X)` のような取り出しは、同じ factory の戻り値として扱う(付録F)
  const cls = classDeclarationOf(ctx, node.arguments[0]);
  const ref = cls === null ? null : classRefOf(ctx, cls);
  if (node.arguments.length > 0 && ref === null) {
    return unresolved('dynamic-accessor-argument');
  }
  const segment =
    ref === null ? callee.name.text : `${callee.name.text}:${ref.filePath}#${ref.name}`;
  return step(callee.expression, [segment, ...path], depth + 1);
};

const originSourcesOf = (
  symbol: ts.Symbol,
  declaration: ts.VariableDeclaration,
  checker: ts.TypeChecker,
): readonly ts.Expression[] => {
  const writes = assignmentsTo(symbol, declaration.getSourceFile(), checker);
  return declaration.initializer === undefined ? writes : [declaration.initializer, ...writes];
};

const traceIdentifierOrigin = (
  ctx: OriginContext,
  node: ts.Identifier,
  path: readonly string[],
  depth: number,
  step: TraceStep,
): ValueOrigin => {
  const symbol = ctx.checker.getSymbolAtLocation(node);
  const declaration = symbol?.valueDeclaration;
  if (symbol === undefined || declaration === undefined) return unresolved('symbol-unresolved');
  if (!ts.isVariableDeclaration(declaration)) return unresolved('not-a-variable');
  const sources = originSourcesOf(symbol, declaration, ctx.checker);
  // 代入が1か所のときだけ由来を確定できる(付録G)
  if (sources.length !== 1 || sources[0] === undefined) return unresolved('multiple-assignments');
  return step(sources[0], path, depth + 1);
};

/**
 * 値がどの呼出の戻り値から来たかを、binding Symbol と静的な property 経路だけで辿る(付録F・G)。
 * runner も DI も知らないので、Unit の receiver にも E2E の app 式にも同じ規則で使える。
 */
export const traceOrigin = (
  ctx: OriginContext,
  expression: ts.Expression,
  path: readonly string[] = [],
  depth = 0,
): ValueOrigin => {
  if (depth > 8) return unresolved('trace-depth-exceeded');
  const step: TraceStep = (next, nextPath, nextDepth) =>
    traceOrigin(ctx, next, nextPath, nextDepth);
  const node = unwrapExpression(expression);

  if (ts.isCallExpression(node)) return traceCallOrigin(ctx, node, path, depth, step);
  if (ts.isPropertyAccessExpression(node)) {
    return step(node.expression, [node.name.text, ...path], depth + 1);
  }
  if (ts.isIdentifier(node)) return traceIdentifierOrigin(ctx, node, path, depth, step);

  return unresolved('unsupported-expression');
};
