import ts from 'typescript';

import type { Material } from '../core';
import type { ZeltContext } from './zelt.types';
import { anchorOf, evidenceOf } from './zelt-context.lib';
import { firstLineOf } from './zelt-runtime.lib';

/**
 * `lifecycle.register(this)` の setup。ここだけは runtime の記録に対応する口が無いので、
 * 作り直し前の TS の読み方をそのまま残している(別に扱う話)。
 */

const injectCallOf = (
  ctx: ZeltContext,
  parameter: ts.ParameterDeclaration,
): ts.CallExpression | null => {
  const initializer = parameter.initializer;
  if (initializer === undefined || !ts.isCallExpression(initializer)) return null;
  return anchorOf(ctx, initializer.expression) === 'inject' ? initializer : null;
};

/** `inject(LifecycleManager)` を受けた parameter。この値への `register` 呼出だけを見る */
const lifecycleHoldersOf = (
  ctx: ZeltContext,
  ctor: ts.ConstructorDeclaration,
): ReadonlySet<ts.Symbol> => {
  const holders = new Set<ts.Symbol>();
  for (const parameter of ctor.parameters) {
    const call = injectCallOf(ctx, parameter);
    const argument = call?.arguments[0];
    if (argument === undefined || anchorOf(ctx, argument) !== 'LifecycleManager') continue;
    const symbol = ctx.checker.getSymbolAtLocation(parameter.name);
    if (symbol !== undefined) holders.add(symbol);
  }
  return holders;
};

/** ignore 推奨にした LifecycleManager への登録呼出は、消さずに setup に残す(4.1) */
const lifecycleSetup = (
  ctx: ZeltContext,
  ctor: ts.ConstructorDeclaration,
  subject: string,
  holders: ReadonlySet<ts.Symbol>,
): readonly Material[] => {
  if (holders.size === 0 || ctor.body === undefined) return [];
  const materials: Material[] = [];
  const visit = (node: ts.Node): void => {
    const callee = ts.isCallExpression(node) ? node.expression : undefined;
    const holder =
      callee !== undefined &&
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === 'register'
        ? ctx.checker.getSymbolAtLocation(callee.expression)
        : undefined;
    if (holder !== undefined && holders.has(holder)) {
      materials.push({
        kind: 'setup',
        subject,
        setup: 'lifecycle',
        label: firstLineOf(node.getText()),
        target: null,
        evidence: evidenceOf(ctx, node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(ctor.body);
  return materials;
};

export const lifecycleSetups = (ctx: ZeltContext): readonly Material[] => {
  const materials: Material[] = [];
  for (const cls of ctx.appClasses) {
    const ctor = cls.members.find(ts.isConstructorDeclaration);
    if (ctor === undefined) continue;
    const subject = ctx.resolver.subjectOf(ctor);
    if (subject === null) continue;
    materials.push(...lifecycleSetup(ctx, ctor, subject, lifecycleHoldersOf(ctx, ctor)));
  }
  return materials;
};
