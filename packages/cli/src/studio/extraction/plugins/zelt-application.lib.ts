import { resolve } from 'node:path';

import ts from 'typescript';

import type { Material } from '../core';
import type { ChainEntry, ZeltApplicationConfig, ZeltContext } from './zelt.types';
import { anchorOf, evidenceOf, note, spanOf } from './zelt-context.lib';
import {
  arrayElementsOf,
  classOfSymbol,
  findNode,
  GLOBAL_MIDDLEWARE_BINDING,
  propertyOf,
  resolveSymbol,
} from './zelt-runtime.lib';

/** http.service.ts が全 route の前に登録する組込み middleware を、その登録の配列から読む */
export const globalMiddlewaresOf = (ctx: ZeltContext): readonly ts.Expression[] => {
  const coreDir = ctx.coreDir;
  if (coreDir === null) return [];
  for (const file of ctx.input.program.getSourceFiles()) {
    if (!file.fileName.startsWith(coreDir)) continue;
    const holder = findNode(
      file,
      (node) =>
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === GLOBAL_MIDDLEWARE_BINDING &&
        node.initializer !== undefined &&
        ts.isArrayLiteralExpression(node.initializer),
    );
    if (holder !== null && ts.isVariableDeclaration(holder)) {
      return arrayElementsOf(holder.initializer);
    }
  }
  return [];
};

type AddRegistrations = (elements: readonly ts.Expression[], evidence?: ts.Node) => void;

const factoryDeclarationOf = (
  ctx: ZeltContext,
  application: ZeltApplicationConfig,
): ts.Declaration | undefined => {
  const file = ctx.input.program.getSourceFile(
    resolve(ctx.config.root, application.factory.filePath),
  );
  const moduleSymbol = file === undefined ? undefined : ctx.checker.getSymbolAtLocation(file);
  return (moduleSymbol === undefined ? [] : ctx.checker.getExportsOfModule(moduleSymbol))
    .filter((symbol) => symbol.name === application.factory.exportName)
    .flatMap((symbol) => symbol.declarations ?? [])[0];
};

const createAppCallOf = (
  ctx: ZeltContext,
  factory: ts.Declaration,
  application: ZeltApplicationConfig,
): ts.CallExpression | null => {
  const createApp = findNode(
    factory,
    (node) => ts.isCallExpression(node) && anchorOf(ctx, node.expression) === 'createApp',
  );
  if (createApp === null || !ts.isCallExpression(createApp)) {
    note(
      ctx,
      'relations',
      'zelt-application-unresolved',
      `createApp not found: ${application.id}`,
      [spanOf(ctx, factory)],
    );
    return null;
  }
  return createApp;
};

const addHttpRegistrations = (options: ts.ObjectLiteralExpression, add: AddRegistrations): void => {
  add(arrayElementsOf(propertyOf(options, 'controllers')?.initializer));
  const middlewares = propertyOf(options, 'middlewares');
  if (middlewares !== undefined) add(arrayElementsOf(middlewares.initializer), middlewares);
};

const addEventBusRegistrations = (
  options: ts.ObjectLiteralExpression,
  add: AddRegistrations,
): void => {
  const adaptor = propertyOf(options, 'adaptor')?.initializer;
  if (adaptor !== undefined) add([adaptor]);
  add(arrayElementsOf(propertyOf(options, 'handlers')?.initializer));
};

const addFeatureRegistrations = (
  ctx: ZeltContext,
  feature: ts.Expression,
  add: AddRegistrations,
): void => {
  if (!ts.isCallExpression(feature)) return;
  const options = feature.arguments[0];
  if (options === undefined || !ts.isObjectLiteralExpression(options)) return;
  const anchor = anchorOf(ctx, feature.expression);
  if (anchor === 'http') addHttpRegistrations(options, add);
  else if (anchor === 'eventbus') addEventBusRegistrations(options, add);
};

/** app factory が登録する class を集める。線はコアに無いので付与された線にする */
const registeredClassesOf = (
  ctx: ZeltContext,
  application: ZeltApplicationConfig,
): { readonly owner: string | null; readonly registered: readonly ChainEntry[] } => {
  const factory = factoryDeclarationOf(ctx, application);
  if (factory === undefined) {
    note(
      ctx,
      'relations',
      'zelt-application-unresolved',
      `factory not found: ${application.id}`,
      [],
    );
    return { owner: null, registered: [] };
  }
  const createApp = createAppCallOf(ctx, factory, application);
  if (createApp === null) return { owner: null, registered: [] };

  const registered: ChainEntry[] = [];
  const add: AddRegistrations = (elements, evidence) => {
    for (const element of elements) {
      registered.push({ expression: element, evidence: evidence ?? element });
    }
  };
  for (const feature of arrayElementsOf(createApp.arguments[0])) {
    addFeatureRegistrations(ctx, feature, add);
  }
  const appOptions = createApp.arguments[1];
  if (appOptions !== undefined && ts.isObjectLiteralExpression(appOptions)) {
    add(arrayElementsOf(propertyOf(appOptions, 'configs')?.initializer));
  }
  return { owner: ctx.resolver.ownerOf(createApp), registered };
};

export type ApplicationFacts = {
  readonly materials: readonly Material[];
  /** app 全体に付く middleware。すべての route の chain に入る */
  readonly appMiddlewares: readonly ChainEntry[];
};

const registerMaterialOf = (
  ctx: ZeltContext,
  application: ZeltApplicationConfig,
  owner: string | null,
  entry: ChainEntry,
): Material | null => {
  const cls = classOfSymbol(resolveSymbol(ctx.checker, entry.expression));
  const to = cls === null ? null : ctx.resolver.subjectOf(cls);
  if (owner === null || to === null) {
    note(ctx, 'relations', 'zelt-register-unresolved', 'registered class not on the map', [
      spanOf(ctx, entry.expression),
    ]);
    return null;
  }
  return {
    kind: 'relation',
    from: owner,
    to,
    relation: 'register',
    applicationId: application.id,
    order: null,
    evidence: evidenceOf(ctx, entry.expression),
  };
};

export const applicationFacts = (ctx: ZeltContext): ApplicationFacts => {
  const materials: Material[] = [];
  const appMiddlewares: ChainEntry[] = [];
  for (const application of ctx.input.applications) {
    const { owner, registered } = registeredClassesOf(ctx, application);
    for (const entry of registered) {
      if (entry.evidence !== entry.expression) appMiddlewares.push(entry);
      const material = registerMaterialOf(ctx, application, owner, entry);
      if (material !== null) materials.push(material);
    }
  }
  return { materials, appMiddlewares };
};
