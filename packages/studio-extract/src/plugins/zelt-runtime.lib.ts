import ts from 'typescript';

import type { IgnoreRecommendation } from '../core';

/**
 * 作り直しの対象外(event・lifecycle・test setup)が使う TS の小道具と、
 * Zelt を使う上で常識として意識しない export の一覧。
 */

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

export const arrayElementsOf = (node: ts.Expression | undefined): readonly ts.Expression[] =>
  node !== undefined && ts.isArrayLiteralExpression(node) ? node.elements : [];
