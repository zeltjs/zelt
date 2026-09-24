import ts from 'typescript';

import type { IgnoreRecommendation } from '../core';

/**
 * Zelt の登録規則のうち、静的解析側で同じ答えを出す必要がある部分。
 * 元の実装は packages/core/src/features/http/routing/path-utils.lib.ts、
 * routing/route-builder.lib.ts、features/http/http.service.ts。
 */

const stripTrailingSlash = (value: string): string =>
  value.endsWith('/') ? value.slice(0, -1) : value;

const ensureLeadingSlash = (value: string): string =>
  value === '' || value.startsWith('/') ? value : `/${value}`;

/** path-utils.lib.ts の joinPath と同じ規則(末尾 `/` を残さない) */
export const joinPath = (base: string, sub: string): string => {
  const a = stripTrailingSlash(base);
  const b = stripTrailingSlash(ensureLeadingSlash(sub));
  const joined = `${a}${b === '/' ? '' : b}`;
  return joined === '' ? '/' : joined;
};

/** http-method.decorator.ts が書く Route metadata の method */
export const ROUTE_METHODS: Readonly<Record<string, string>> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
};

/** createInjectableClassDecorator 経由で injectable() が付く class decorator */
export const INJECTABLE_DECORATORS: readonly string[] = [
  'Injectable',
  'Controller',
  'Middleware',
  'Config',
];

/** middleware chain に入るが middleware class を持たない decorator(route-builder.lib.ts) */
export const CHAIN_DECORATORS_WITHOUT_CLASS: readonly string[] = ['Authorized'];

/** middleware instance が実装する実行 method(middleware.types.ts の MiddlewareInstance) */
export const MIDDLEWARE_EXEC_METHOD = 'use';

/** http.service.ts が全 route の前に登録する組込み middleware を保持する変数 */
export const GLOBAL_MIDDLEWARE_BINDING = 'securityMiddlewares';

export const EVENT_BUS_METHODS: Readonly<Record<string, 'subscribe' | 'emit'>> = {
  on: 'subscribe',
  once: 'subscribe',
  emit: 'emit',
};

/** 付録 D: Zelt を使う上で常識として意識しない export */
export const ZELT_IGNORE_RECOMMENDATIONS: readonly IgnoreRecommendation[] = [
  {
    package: '@zeltjs/core',
    exports: [
      'inject',
      'request',
      'currentUser',
      'requestContext',
      'LifecycleManager',
      'Controller',
      'Get',
      'Post',
      'Put',
      'Patch',
      'Delete',
      'UseMiddleware',
      'Authorized',
      'Injectable',
      'Middleware',
      'Config',
    ],
  },
  { package: '@zeltjs/rate-limit', exports: ['RateLimit'] },
];

export const resolveSymbol = (checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined => {
  const symbol = checker.getSymbolAtLocation(node);
  if (symbol === undefined) return undefined;
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
};

export const classOfSymbol = (symbol: ts.Symbol | undefined): ts.ClassDeclaration | null => {
  for (const declaration of symbol?.declarations ?? []) {
    if (ts.isClassDeclaration(declaration)) return declaration;
  }
  return null;
};

export const decoratorCallee = (decorator: ts.Decorator): ts.Node =>
  ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression;

export const decoratorArguments = (decorator: ts.Decorator): readonly ts.Expression[] =>
  ts.isCallExpression(decorator.expression) ? decorator.expression.arguments : [];

export const stringLiteralOf = (node: ts.Node | undefined): string | null =>
  node !== undefined && ts.isStringLiteralLike(node) ? node.text : null;

export const unwrapAssertion = (node: ts.Expression): ts.Expression =>
  ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)
    ? unwrapAssertion(node.expression)
    : node;

export const propertyOf = (
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | undefined => {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = property.name;
    if (!ts.isIdentifier(key) && !ts.isStringLiteralLike(key)) continue;
    if (key.text === name) return property;
  }
  return undefined;
};

/** 最初の行だけを根拠の式として使う(コアの evidence と同じ扱い) */
export const firstLineOf = (text: string): string => (text.split('\n')[0] ?? '').trim();

/** middleware instance の実行 method(`use`)の宣言 */
export const execMethodOf = (cls: ts.ClassDeclaration): ts.MethodDeclaration | null => {
  for (const member of cls.members) {
    if (!ts.isMethodDeclaration(member)) continue;
    if (ts.isIdentifier(member.name) && member.name.text === MIDDLEWARE_EXEC_METHOD) return member;
  }
  return null;
};

export const arrayElementsOf = (node: ts.Expression | undefined): readonly ts.Expression[] =>
  node !== undefined && ts.isArrayLiteralExpression(node) ? node.elements : [];

export const findNode = (root: ts.Node, match: (node: ts.Node) => boolean): ts.Node | null => {
  let found: ts.Node | null = null;
  const step = (node: ts.Node): void => {
    if (found !== null) return;
    if (match(node)) {
      found = node;
      return;
    }
    ts.forEachChild(node, step);
  };
  step(root);
  return found;
};

const bodyOfFunction = (node: ts.Node): ts.Node | undefined =>
  ts.isArrowFunction(node) || ts.isFunctionDeclaration(node) ? node.body : undefined;

/** arrow の式本体、または body 内の最初の return 式 */
export const returnExpressionOf = (node: ts.Node): ts.Expression | null => {
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) return node.body;
  const body = bodyOfFunction(node);
  if (body === undefined) return null;
  const statement = findNode(body, ts.isReturnStatement);
  if (statement === null || !ts.isReturnStatement(statement)) return null;
  return statement.expression ?? null;
};

/** decorator factory が metadata に書く `decorator: '<name>'` を読む(routing-metadata.lib.ts が照合するキー) */
export const declaredMetadataName = (declaration: ts.Node): string | null => {
  const holder = findNode(declaration, (node) => {
    if (!ts.isObjectLiteralExpression(node)) return false;
    const property = propertyOf(node, 'decorator');
    return property !== undefined && ts.isStringLiteralLike(unwrapAssertion(property.initializer));
  });
  if (holder === null || !ts.isObjectLiteralExpression(holder)) return null;
  const property = propertyOf(holder, 'decorator');
  return property === undefined ? null : stringLiteralOf(unwrapAssertion(property.initializer));
};
