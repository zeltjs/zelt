import ts from 'typescript';

import type { DeclarationKind } from './snapshot-schema.lib';

export const firstLine = (text: string): string => (text.split('\n')[0] ?? '').trim();

const propertyNameText = (name: ts.Node): string | null => {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
};

const signatureMemberNameOf = (node: ts.Node): string | null =>
  ts.isMethodSignature(node) || ts.isPropertySignature(node) ? propertyNameText(node.name) : null;

export const memberNameOf = (node: ts.Node): string | null => {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (
    ts.isMethodDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    return propertyNameText(node.name);
  }
  return signatureMemberNameOf(node);
};

export const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);

const accessorKindOf = (node: ts.Node): DeclarationKind | null => {
  if (ts.isGetAccessorDeclaration(node)) return 'getter';
  // v1 に setter の種類が無いので、値を持つメンバーとして property に寄せる(付録N)
  if (ts.isSetAccessorDeclaration(node)) return 'property';
  return null;
};

export const memberKindOf = (node: ts.Node): DeclarationKind | null => {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (ts.isMethodDeclaration(node)) return 'method';
  if (ts.isPropertyDeclaration(node)) return 'property';
  if (ts.isMethodSignature(node) || ts.isPropertySignature(node)) return 'signature';
  return accessorKindOf(node);
};

export const asFunctionValue = (
  node: ts.Node | undefined,
): ts.ArrowFunction | ts.FunctionExpression | undefined =>
  node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node))
    ? node
    : undefined;

const accessorBodyOf = (node: ts.Node): ts.Node | undefined =>
  ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) ? node.body : undefined;

export const bodyOf = (node: ts.Node): ts.Node | undefined => {
  if (
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  ) {
    return node.body;
  }
  return accessorBodyOf(node);
};

const asFunctionSignature = (node: ts.Node): ts.SignatureDeclaration | undefined =>
  ts.isFunctionDeclaration(node) ||
  ts.isArrowFunction(node) ||
  ts.isFunctionExpression(node) ||
  ts.isCallSignatureDeclaration(node)
    ? node
    : undefined;

export const asSignature = (node: ts.Node): ts.SignatureDeclaration | undefined => {
  if (
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isMethodSignature(node)
  ) {
    return node;
  }
  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) return node;
  return asFunctionSignature(node);
};

export const slice = (node: ts.Node, start: number, end: number): string =>
  node.getSourceFile().text.slice(start, end);

const signatureEndOf = (node: ts.SignatureDeclaration): number => {
  if (ts.isArrowFunction(node)) return node.equalsGreaterThanToken.getEnd();
  const body = bodyOf(node);
  return body === undefined ? node.getEnd() : body.getFullStart();
};

export const functionSignature = (node: ts.SignatureDeclaration, start: number): string =>
  slice(node, start, signatureEndOf(node)).trimEnd();

const skipSpace = (node: ts.Node, from: number): number => {
  const text = node.getSourceFile().text;
  let i = from;
  while (i < text.length && /\s/u.test(text[i] ?? '')) i += 1;
  return i;
};

// decorator は所在(location)には含めるが signature には出さない(fixture と同じ)
export const signatureStartOf = (node: ts.Node): number => {
  const modifier = ts.canHaveModifiers(node) ? ts.getModifiers(node)?.[0] : undefined;
  if (modifier !== undefined) return modifier.getStart();
  const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
  const last = decorators?.[decorators.length - 1];
  return last === undefined ? node.getStart() : skipSpace(node, last.getEnd());
};

const withoutInitializer = (
  node: ts.Node,
  start: number,
  initializer: ts.Node | undefined,
): string =>
  initializer === undefined
    ? slice(node, start, node.getEnd())
    : slice(node, start, initializer.getStart()).replace(/=\s*$/u, '').trimEnd();

const initializedSignature = (
  node: ts.PropertyDeclaration | ts.VariableDeclaration,
  start: number,
  allowsText: (node: ts.Node) => boolean,
): string =>
  allowsText(node)
    ? slice(node, start, node.getEnd())
    : withoutInitializer(node, start, node.initializer);

const variableSignature = (
  node: ts.VariableDeclaration,
  start: number,
  allowsText: (node: ts.Node) => boolean,
): string => {
  const fn = asFunctionValue(node.initializer);
  if (fn !== undefined) {
    return `${slice(node, start, fn.getStart())}${functionSignature(fn, fn.getStart())}`;
  }
  return initializedSignature(node, start, allowsText);
};

export const declarationSignature = (
  node: ts.Node,
  start: number,
  allowsText: (node: ts.Node) => boolean,
): string => {
  if (ts.isTypeAliasDeclaration(node) || ts.isPropertySignature(node)) {
    return slice(node, start, node.getEnd());
  }
  if (ts.isPropertyDeclaration(node)) return initializedSignature(node, start, allowsText);
  if (ts.isVariableDeclaration(node)) return variableSignature(node, start, allowsText);
  const signature = asSignature(node);
  if (signature !== undefined) return functionSignature(signature, start);
  return slice(node, start, node.getEnd());
};

export const classHeader = (
  node: ts.ClassDeclaration | ts.InterfaceDeclaration,
  start: number,
): string => slice(node, start, Math.max(start, node.members.pos - 1)).trimEnd();
