import ts from 'typescript';

import type { Target } from './core-facts.types';
import type { CoreIndex } from './core-index.lib';
import { addMention, emit, resolveSymbol, targetFor, targetOfSymbol } from './core-index.lib';
import type { TsRelationKind } from './snapshot-schema.lib';
import {
  asFunctionValue,
  asSignature,
  bodyOf,
  firstLine,
  functionSignature,
  hasModifier,
  memberNameOf,
  signatureStartOf,
  slice,
} from './source-text.lib';

const isWriteTarget = (node: ts.Node): boolean => {
  const parent = node.parent;
  return (
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  );
};

// class を値として渡す式は流れではなく部品の組み方なので線にしない(4.1)
const isClassValue = (symbol: ts.Symbol | undefined): boolean =>
  (symbol?.declarations ?? []).some((decl) => ts.isClassDeclaration(decl));

/** `(x)`・`x!`・`await x`・`x as T`・`x satisfies T` の中身 */
const unwrappedOperand = (node: ts.Expression): ts.Expression | undefined =>
  ts.isParenthesizedExpression(node) ||
  ts.isNonNullExpression(node) ||
  ts.isAwaitExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isSatisfiesExpression(node)
    ? node.expression
    : undefined;

const readPropertyAccess = (
  index: CoreIndex,
  node: ts.PropertyAccessExpression,
  ownerId: string,
): void => {
  const symbol = resolveSymbol(index, node.name);
  if (!isClassValue(symbol)) {
    const target = targetOfSymbol(index, symbol);
    if (target !== null) emit(index, ownerId, target.id, 'read', node, firstLine(node.getText()));
  }
  readValue(index, node.expression, ownerId);
};

const readIdentifier = (index: CoreIndex, node: ts.Expression, ownerId: string): void => {
  if (!ts.isIdentifier(node)) return;
  const symbol = resolveSymbol(index, node);
  if (isClassValue(symbol)) {
    addMention(index, ownerId, symbol, node);
    return;
  }
  const target = targetOfSymbol(index, symbol);
  if (target !== null) emit(index, ownerId, target.id, 'read', node, node.getText());
};

function readValue(index: CoreIndex, node: ts.Expression, ownerId: string): void {
  if (isWriteTarget(node)) return;
  // 中間の呼出も receiver なので、そこから先の property を読み落とさない
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    visitCall(index, node, ownerId);
    return;
  }
  const unwrapped = unwrappedOperand(node);
  if (unwrapped !== undefined) {
    readValue(index, unwrapped, ownerId);
    return;
  }
  if (ts.isPropertyAccessExpression(node)) {
    readPropertyAccess(index, node, ownerId);
    return;
  }
  if (ts.isElementAccessExpression(node)) {
    readValue(index, node.expression, ownerId);
    return;
  }
  readIdentifier(index, node, ownerId);
}

const emitTypeRef = (index: CoreIndex, name: ts.Node, ownerId: string): void => {
  const target = targetOfSymbol(index, resolveSymbol(index, name));
  if (target !== null) {
    emit(index, ownerId, target.id, 'type', name, firstLine(name.getText()));
    return;
  }
  if (ts.isQualifiedName(name)) emitTypeRef(index, name.left, ownerId);
  else if (ts.isPropertyAccessExpression(name)) emitTypeRef(index, name.expression, ownerId);
};

const indexedAccessesOf = (node: ts.Node): ts.IndexedAccessTypeNode[] => {
  const found: ts.IndexedAccessTypeNode[] = [];
  const step = (current: ts.Node): void => {
    if (ts.isIndexedAccessTypeNode(current)) found.push(current);
    ts.forEachChild(current, step);
  };
  step(node);
  return found;
};

const hasTypeParameterNamed = (signature: ts.SignatureDeclaration, name: string): boolean =>
  (signature.typeParameters ?? []).some((parameter) => parameter.name.text === name);

const parameterPositionOfType = (signature: ts.SignatureDeclaration, name: string): number =>
  signature.parameters.findIndex(
    (parameter) =>
      parameter.type !== undefined &&
      ts.isTypeReferenceNode(parameter.type) &&
      ts.isIdentifier(parameter.type.typeName) &&
      parameter.type.typeName.text === name,
  );

/** `T[K]` の K が signature のどの parameter で決まるか(`event: K` の位置) */
const keyArgumentOf = (
  signature: ts.SignatureDeclaration,
  call: ts.CallExpression | ts.NewExpression,
  indexType: ts.TypeNode,
): ts.Expression | null => {
  if (!ts.isTypeReferenceNode(indexType) || !ts.isIdentifier(indexType.typeName)) return null;
  const name = indexType.typeName.text;
  if (!hasTypeParameterNamed(signature, name)) return null;
  const position = parameterPositionOfType(signature, name);
  return position < 0 ? null : ((call.arguments ?? [])[position] ?? null);
};

type InferredTypeContext = {
  readonly declaration: ts.SignatureDeclaration;
  readonly call: ts.CallExpression | ts.NewExpression;
  readonly ownerId: string;
};

const emitResolvedProperty = (
  index: CoreIndex,
  property: ts.Symbol | undefined,
  owner: string,
): void => {
  for (const member of property?.declarations ?? []) {
    const target = targetFor(index, member);
    const name = ts.getNameOfDeclaration(member);
    if (target === null || name === undefined) continue;
    emit(index, owner, target.id, 'type', name, firstLine(name.getText()));
  }
};

const emitIndexedAccessType = (
  index: CoreIndex,
  ctx: InferredTypeContext,
  indexed: ts.IndexedAccessTypeNode,
  owner: string,
): void => {
  const key = keyArgumentOf(ctx.declaration, ctx.call, indexed.indexType);
  if (key === null) return;
  const keyType = index.checker.getTypeAtLocation(key);
  if (!keyType.isStringLiteral()) return;
  const property = index.checker.getPropertyOfType(
    index.checker.getTypeFromTypeNode(indexed.objectType),
    keyType.value,
  );
  emitResolvedProperty(index, property, owner);
};

const emitParameterIndexTypes = (
  index: CoreIndex,
  ctx: InferredTypeContext,
  position: number,
  parameter: ts.ParameterDeclaration,
): void => {
  if (parameter.type === undefined) return;
  const argument = (ctx.call.arguments ?? [])[position];
  if (argument === undefined) return;
  const owner = index.callbackIds.get(argument) ?? ctx.ownerId;
  for (const indexed of indexedAccessesOf(parameter.type)) {
    emitIndexedAccessType(index, ctx, indexed, owner);
  }
};

/**
 * 型引数が literal に推論され、parameter の `T[K]` が T の property へ解決される呼出は、
 * その property への型の線にする(付録N)。呼出側に型の字面が無いので根拠は解決先の名前。
 */
const emitInferredIndexTypes = (
  index: CoreIndex,
  call: ts.CallExpression | ts.NewExpression,
  ownerId: string,
): void => {
  const declaration = index.checker.getResolvedSignature(call)?.declaration;
  if (declaration === undefined || !ts.isFunctionLike(declaration)) return;
  if ((declaration.typeParameters ?? []).length === 0) return;
  const ctx: InferredTypeContext = { declaration, call, ownerId };
  for (const [position, parameter] of declaration.parameters.entries()) {
    emitParameterIndexTypes(index, ctx, position, parameter);
  }
};

// ── walking ─────────────────────────────────────────────────────────────────
const visitTypeNode = (
  index: CoreIndex,
  node: ts.TypeReferenceNode | ts.TypeQueryNode,
  owner: string,
): void => {
  emitTypeRef(index, ts.isTypeReferenceNode(node) ? node.typeName : node.exprName, owner);
  for (const arg of node.typeArguments ?? []) visit(index, arg, owner);
};

const visitTypeOrSignature = (index: CoreIndex, node: ts.Node, owner: string): boolean => {
  if (ts.isTypeReferenceNode(node) || ts.isTypeQueryNode(node)) {
    visitTypeNode(index, node, owner);
    return true;
  }
  if (ts.isPropertySignature(node) || ts.isMethodSignature(node)) {
    visitSignatureHead(index, node, owner);
    return true;
  }
  return false;
};

const visitValueNode = (index: CoreIndex, node: ts.Node, owner: string): boolean => {
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    visitCall(index, node, owner);
    return true;
  }
  if (ts.isPropertyAccessExpression(node) || ts.isIdentifier(node)) {
    readValue(index, node, owner);
    return true;
  }
  if (ts.isElementAccessExpression(node)) {
    readValue(index, node, owner);
    visit(index, node.argumentExpression, owner);
    return true;
  }
  if (ts.isPropertyAssignment(node)) {
    visit(index, node.initializer, owner);
    return true;
  }
  return false;
};

function visit(index: CoreIndex, node: ts.Node, currentOwner: string): void {
  const owner = index.callbackIds.get(node) ?? currentOwner;
  if (ts.isDecorator(node)) return;
  if (visitTypeOrSignature(index, node, owner)) return;
  if (visitValueNode(index, node, owner)) return;
  ts.forEachChild(node, (child) => {
    visit(index, child, owner);
  });
}

const visitParameter = (
  index: CoreIndex,
  parameter: ts.ParameterDeclaration,
  owner: string,
): void => {
  if (parameter.type !== undefined) visit(index, parameter.type, owner);
  if (parameter.initializer !== undefined) visit(index, parameter.initializer, owner);
};

function visitSignatureHead(index: CoreIndex, node: ts.Node, owner: string): void {
  if (ts.isPropertySignature(node)) {
    if (node.type !== undefined) visit(index, node.type, owner);
    return;
  }
  const signature = asSignature(node);
  if (signature === undefined) return;
  for (const parameter of signature.parameters) visitParameter(index, parameter, owner);
  if (signature.type !== undefined) visit(index, signature.type, owner);
}

const visitArgument = (index: CoreIndex, arg: ts.Expression, ownerId: string): void => {
  const callbackId = index.callbackIds.get(arg);
  const fn = asFunctionValue(arg);
  if (callbackId !== undefined && fn !== undefined) {
    emit(index, ownerId, callbackId, 'read', fn, functionSignature(fn, fn.getStart()));
  }
  visit(index, arg, ownerId);
};

const relationKindOf = (
  node: ts.CallExpression | ts.NewExpression,
  target: Target,
): TsRelationKind =>
  ts.isNewExpression(node) ? 'construct' : target.isInterfaceMember ? 'contract' : 'call';

const emitCallRelation = (
  index: CoreIndex,
  node: ts.CallExpression | ts.NewExpression,
  target: Target,
  ownerId: string,
): void => {
  emit(index, ownerId, target.id, relationKindOf(node, target), node, firstLine(node.getText()));
  // 呼んだ相手自身は read にしないが、中間 receiver の property は読む(付録B)
  if (ts.isPropertyAccessExpression(node.expression)) {
    readValue(index, node.expression.expression, ownerId);
  }
};

const visitCallArguments = (
  index: CoreIndex,
  node: ts.CallExpression | ts.NewExpression,
  ownerId: string,
): void => {
  for (const arg of node.typeArguments ?? []) visit(index, arg, ownerId);
  for (const arg of node.arguments ?? []) visitArgument(index, arg, ownerId);
};

function visitCall(
  index: CoreIndex,
  node: ts.CallExpression | ts.NewExpression,
  ownerId: string,
): void {
  const declaration = index.checker.getResolvedSignature(node)?.declaration;
  const target = declaration === undefined ? null : targetFor(index, declaration);
  if (target === null) readValue(index, node.expression, ownerId);
  else emitCallRelation(index, node, target, ownerId);
  emitInferredIndexTypes(index, node, ownerId);
  visitCallArguments(index, node, ownerId);
}

// ── pass 2 entry points ─────────────────────────────────────────────────────
const visitTypedDeclaration = (
  index: CoreIndex,
  node: ts.VariableDeclaration | ts.PropertyDeclaration,
  owner: string,
): void => {
  if (node.type !== undefined) visit(index, node.type, owner);
  if (node.initializer !== undefined) visit(index, node.initializer, owner);
};

const visitSignatureWalkable = (index: CoreIndex, node: ts.Node, owner: string): void => {
  visitSignatureHead(index, node, owner);
  const body = bodyOf(node);
  if (body !== undefined) visit(index, body, owner);
};

export const visitWalkable = (index: CoreIndex, node: ts.Node, owner: string): void => {
  if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) {
    visitTypedDeclaration(index, node, owner);
    return;
  }
  if (ts.isTypeAliasDeclaration(node)) {
    visit(index, node.type, owner);
    return;
  }
  if (asSignature(node) !== undefined || ts.isPropertySignature(node)) {
    visitSignatureWalkable(index, node, owner);
    return;
  }
  ts.forEachChild(node, (child) => {
    visit(index, child, owner);
  });
};

const emitHeritage = (
  index: CoreIndex,
  node: ts.ClassDeclaration | ts.InterfaceDeclaration,
  id: string,
): void => {
  for (const clause of node.heritageClauses ?? []) {
    const kind: TsRelationKind =
      clause.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';
    for (const type of clause.types) {
      const target = targetOfSymbol(index, resolveSymbol(index, type.expression));
      if (target !== null) emit(index, id, target.id, kind, clause, firstLine(clause.getText()));
    }
  }
};

type OverrideContext = {
  readonly member: ts.ClassElement;
  readonly ownerId: string;
  readonly name: string;
};

const emitOverride = (index: CoreIndex, ctx: OverrideContext, target: Target): void => {
  const member = ctx.member;
  const start = signatureStartOf(member);
  const nameNode = ts.isConstructorDeclaration(member) ? undefined : member.name;
  const end = nameNode?.getEnd() ?? member.getEnd();
  emit(
    index,
    ctx.ownerId,
    target.id,
    'override',
    member,
    slice(member, start, end).trim(),
    start,
    end,
  );
};

const emitOverridesForClause = (
  index: CoreIndex,
  clause: ts.HeritageClause,
  ctx: OverrideContext,
): void => {
  if (clause.token !== ts.SyntaxKind.ExtendsKeyword) return;
  for (const type of clause.types) {
    const property = index.checker.getPropertyOfType(
      index.checker.getTypeAtLocation(type),
      ctx.name,
    );
    const target = targetOfSymbol(index, property);
    if (target === null) continue;
    emitOverride(index, ctx, target);
  }
};

const emitOverridesOf = (
  index: CoreIndex,
  node: ts.ClassDeclaration,
  member: ts.ClassElement,
): void => {
  if (!hasModifier(member, ts.SyntaxKind.OverrideKeyword)) return;
  const name = memberNameOf(member);
  const ownerId = index.nodeToDecl.get(member);
  if (name === null || ownerId === undefined) return;
  for (const clause of node.heritageClauses ?? []) {
    emitOverridesForClause(index, clause, { member, ownerId, name });
  }
};

export const emitContainerRelations = (
  index: CoreIndex,
  node: ts.ClassDeclaration | ts.InterfaceDeclaration,
  id: string,
): void => {
  emitHeritage(index, node, id);
  if (!ts.isClassDeclaration(node)) return;
  for (const member of node.members) emitOverridesOf(index, node, member);
};
