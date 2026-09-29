import ts from 'typescript';

import type { Material } from '../core';
import { relationIdOf } from '../core';
import type { BusCall, ZeltContext } from './zelt.types';
import { anchorOf, evidenceOf, note, spanOf } from './zelt-context.lib';
import {
  classOfSymbol,
  EVENT_BUS_METHODS,
  resolveSymbol,
  stringLiteralOf,
} from './zelt-runtime.lib';

const injectArgumentOf = (
  ctx: ZeltContext,
  declaration: ts.Declaration,
): ts.Expression | undefined => {
  const initializer =
    ts.isParameter(declaration) || ts.isPropertyDeclaration(declaration)
      ? declaration.initializer
      : undefined;
  if (initializer === undefined || !ts.isCallExpression(initializer)) return undefined;
  if (anchorOf(ctx, initializer.expression) !== 'inject') return undefined;
  return initializer.arguments[0];
};

/** 注入された bus の登録元 class。event の突き合わせはこの class が同じときだけ */
const busOf = (ctx: ZeltContext, receiver: ts.Expression): ts.ClassDeclaration | null => {
  const node = ts.isPropertyAccessExpression(receiver) ? receiver.name : receiver;
  for (const declaration of ctx.checker.getSymbolAtLocation(node)?.declarations ?? []) {
    const argument = injectArgumentOf(ctx, declaration);
    if (argument !== undefined) return classOfSymbol(resolveSymbol(ctx.checker, argument));
  }
  return null;
};

export const busCallsOf = (ctx: ZeltContext): readonly BusCall[] => {
  const eventBusDir = ctx.eventBusDir;
  if (eventBusDir === null) return [];
  const calls: BusCall[] = [];
  const collect = (node: ts.CallExpression, callee: ts.PropertyAccessExpression): void => {
    const kind = EVENT_BUS_METHODS[callee.name.text];
    const declaration = ctx.checker.getResolvedSignature(node)?.declaration;
    const fromBus = declaration?.getSourceFile().fileName.startsWith(eventBusDir) === true;
    if (kind === undefined || !fromBus) return;
    calls.push({
      kind,
      call: node,
      bus: busOf(ctx, callee.expression),
      event: stringLiteralOf(node.arguments[0]),
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      collect(node, node.expression);
    }
    ts.forEachChild(node, visit);
  };
  for (const file of ctx.appFiles) visit(file);
  return calls;
};

const matchesSubscription = (emit: BusCall, subscription: BusCall): boolean =>
  emit.kind === 'emit' &&
  emit.event !== null &&
  emit.bus !== null &&
  emit.event === subscription.event &&
  emit.bus === subscription.bus;

const evidenceEndOf = (call: ts.CallExpression): number =>
  call.arguments[0]?.getEnd() ?? call.getEnd();

const applicationIdOf = (ctx: ZeltContext): string | null => ctx.input.applications[0]?.id ?? null;

const eventRelations = (
  ctx: ZeltContext,
  subscription: BusCall,
  calls: readonly BusCall[],
  callbackId: string,
): readonly Material[] => {
  const evidence = evidenceOf(
    ctx,
    subscription.call,
    subscription.call.getStart(),
    evidenceEndOf(subscription.call),
  );
  const materials: Material[] = [];
  for (const emit of calls) {
    if (!matchesSubscription(emit, subscription)) continue;
    const from = ctx.resolver.ownerOf(emit.call);
    if (from === null) continue;
    materials.push({
      kind: 'relation',
      from,
      to: callbackId,
      relation: 'event',
      applicationId: applicationIdOf(ctx),
      order: null,
      evidence,
    });
  }
  return materials;
};

export const subscriptionFacts = (
  ctx: ZeltContext,
  subscription: BusCall,
  calls: readonly BusCall[],
): readonly Material[] => {
  const callback = subscription.call.arguments[1];
  const isFunction =
    callback !== undefined && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback));
  const callbackId = isFunction ? ctx.resolver.subjectOf(callback) : null;
  const owner = ctx.resolver.ownerOf(subscription.call);
  if (callbackId === null || owner === null) {
    note(ctx, 'relations', 'zelt-subscription-unresolved', 'subscription callback not resolved', [
      spanOf(ctx, subscription.call),
    ]);
    return [];
  }
  // 関数を渡す線はコアの `read` のまま。種類を置き換えず意味だけ足す(4.1)
  const materials: Material[] = [
    {
      kind: 'meaning',
      subject: relationIdOf(owner, callbackId, 'read'),
      meaning: 'register',
      evidence: evidenceOf(ctx, subscription.call),
    },
  ];
  if (subscription.event !== null) {
    materials.push({
      kind: 'hint',
      subject: callbackId,
      label: `EVENT ${subscription.event}`,
      evidence: evidenceOf(ctx, subscription.call),
    });
  }
  materials.push(...eventRelations(ctx, subscription, calls, callbackId));
  return materials;
};

const moduleBlockOf = (statement: ts.Statement): ts.ModuleBlock | null => {
  if (!ts.isModuleDeclaration(statement) || statement.body === undefined) return null;
  return ts.isModuleBlock(statement.body) ? statement.body : null;
};

const mergedSchemaInterface = (
  ctx: ZeltContext,
  schema: ReadonlySet<ts.Declaration>,
  inner: ts.Statement,
): ts.InterfaceDeclaration | null => {
  if (!ts.isInterfaceDeclaration(inner)) return null;
  const merged = (ctx.checker.getSymbolAtLocation(inner.name)?.declarations ?? []).some(
    (declaration) => schema.has(declaration),
  );
  return merged ? inner : null;
};

const memberMeanings = (
  ctx: ZeltContext,
  members: readonly ts.TypeElement[],
): readonly Material[] => {
  const materials: Material[] = [];
  for (const member of members) {
    const subject = ctx.resolver.subjectOf(member);
    if (subject === null) continue;
    materials.push({
      kind: 'meaning',
      subject,
      meaning: 'event-type',
      evidence: evidenceOf(ctx, member),
    });
  }
  return materials;
};

/** EventBusSchema の宣言マージで足した member に意味 event-type を付ける */
export const eventTypeMeanings = (ctx: ZeltContext): readonly Material[] => {
  const schema = new Set(ctx.resolver.exportsOf('@zeltjs/eventbus', ['EventBusSchema']));
  const materials: Material[] = [];
  for (const file of ctx.appFiles) {
    for (const statement of file.statements) {
      const block = moduleBlockOf(statement);
      if (block === null) continue;
      for (const inner of block.statements) {
        const merged = mergedSchemaInterface(ctx, schema, inner);
        if (merged !== null) materials.push(...memberMeanings(ctx, merged.members));
      }
    }
  }
  return materials;
};
