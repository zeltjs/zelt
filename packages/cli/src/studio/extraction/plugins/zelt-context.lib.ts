import { dirname } from 'node:path';

import ts from 'typescript';

import type { CoreResolver, Evidence, Feature, ResolvedConfig, Span } from '../core';
import type { Registration, ZeltContext, ZeltInput } from './zelt.types';
import {
  CHAIN_DECORATORS_WITHOUT_CLASS,
  classOfSymbol,
  declaredMetadataName,
  decoratorArguments,
  decoratorCallee,
  execMethodOf,
  resolveSymbol,
  returnExpressionOf,
} from './zelt-runtime.lib';

export const ZELT_PROVIDER = 'zelt';

export const ZELT_FEATURES: readonly Feature[] = [
  'routes',
  'relations',
  'hints',
  'setup',
  'meanings',
  'di',
  'test-setups',
];

/** anchor は package の export symbol で引く。名前の見た目では判定しない(4.4) */
const ANCHOR_EXPORTS: Readonly<Record<string, readonly string[]>> = {
  '@zeltjs/core': [
    'UseMiddleware',
    'Injectable',
    'Controller',
    'Middleware',
    'Config',
    'inject',
    'createApp',
    'http',
    'LifecycleManager',
    'Get',
    'Post',
    'Put',
    'Patch',
    'Delete',
  ],
  '@zeltjs/eventbus': ['eventbus', 'EventBusSchema'],
};

const packageDirOf = (config: ResolvedConfig, specifier: string): string | null => {
  const entry = config.sourceModules[specifier];
  return entry === undefined ? null : `${dirname(entry)}/`;
};

const anchorIndexOf = (resolver: CoreResolver): Map<ts.Declaration, string> => {
  const anchorNames = new Map<ts.Declaration, string>();
  for (const [specifier, names] of Object.entries(ANCHOR_EXPORTS)) {
    for (const name of names) {
      for (const declaration of resolver.exportsOf(specifier, [name])) {
        anchorNames.set(declaration, name);
      }
    }
  }
  return anchorNames;
};

const appClassesOf = (files: readonly ts.SourceFile[]): readonly ts.ClassDeclaration[] =>
  files.flatMap((file) =>
    file.statements.flatMap((statement) =>
      ts.isClassDeclaration(statement) && statement.name !== undefined ? [statement] : [],
    ),
  );

export const createZeltContext = (input: ZeltInput): ZeltContext => {
  const { config, resolver, program } = input;
  const appFiles = program
    .getSourceFiles()
    .filter(
      (file) => !file.isDeclarationFile && config.isIncluded(resolver.relativePath(file.fileName)),
    );
  return {
    input,
    checker: input.checker,
    config,
    resolver,
    appFiles,
    appClasses: appClassesOf(appFiles),
    coreDir: packageDirOf(config, '@zeltjs/core'),
    eventBusDir: packageDirOf(config, '@zeltjs/eventbus'),
    anchors: anchorIndexOf(resolver),
    execIds: new Map(),
    diagnostics: new Map(),
  };
};

export const note = (
  ctx: ZeltContext,
  feature: Feature,
  code: string,
  message: string,
  spans: readonly Span[],
): void => {
  const list = ctx.diagnostics.get(feature) ?? [];
  list.push({ code, message, subject: null, spans });
  ctx.diagnostics.set(feature, list);
};

export const spanOf = (ctx: ZeltContext, node: ts.Node, start?: number, end?: number): Span =>
  ctx.resolver.spanOf(node, start, end);

export const evidenceOf = (
  ctx: ZeltContext,
  node: ts.Node,
  start?: number,
  end?: number,
): readonly Evidence[] => [
  { provider: ZELT_PROVIDER, span: spanOf(ctx, node, start, end), basis: 'syntax' },
];

export const anchorOf = (ctx: ZeltContext, node: ts.Node): string | null => {
  for (const declaration of resolveSymbol(ctx.checker, node)?.declarations ?? []) {
    const name = ctx.anchors.get(declaration);
    if (name !== undefined) return name;
  }
  return null;
};

/** `X` と `X.with(opts)` のどちらからも middleware class を取る */
export const middlewareClassOf = (
  ctx: ZeltContext,
  expression: ts.Expression,
): ts.ClassDeclaration | null => {
  const callee = ts.isCallExpression(expression) ? expression.expression : expression;
  const holder = ts.isPropertyAccessExpression(callee) ? callee.expression : callee;
  return classOfSymbol(resolveSymbol(ctx.checker, holder));
};

export const execIdOf = (
  ctx: ZeltContext,
  expression: ts.Expression,
  feature: Feature,
): string | null => {
  const cls = middlewareClassOf(ctx, expression);
  if (cls === null) {
    note(ctx, feature, 'zelt-middleware-unresolved', 'middleware class not resolved', [
      spanOf(ctx, expression),
    ]);
    return null;
  }
  const cached = ctx.execIds.get(cls);
  if (cached !== undefined) return cached;
  const method = execMethodOf(cls);
  const id = method === null ? null : ctx.resolver.subjectOf(method);
  if (id === null) {
    note(ctx, feature, 'zelt-middleware-exec-unresolved', `${cls.name?.text ?? '?'} has no use()`, [
      spanOf(ctx, expression),
    ]);
    return null;
  }
  ctx.execIds.set(cls, id);
  return id;
};

const declarationTargetOf = (declaration: ts.Declaration): ts.Node =>
  ts.isVariableDeclaration(declaration) ? (declaration.initializer ?? declaration) : declaration;

const unwrapUseMiddleware = (ctx: ZeltContext, target: ts.Node): ts.CallExpression | null => {
  const returned = returnExpressionOf(target);
  if (returned === null || !ts.isCallExpression(returned)) return null;
  return anchorOf(ctx, returned.expression) === 'UseMiddleware' ? returned : null;
};

const registrationFromDeclaration = (
  ctx: ZeltContext,
  decorator: ts.Decorator,
  declaration: ts.Declaration,
): Registration | null => {
  const target = declarationTargetOf(declaration);
  const wrapped = unwrapUseMiddleware(ctx, target);
  const argument = wrapped?.arguments[0];
  if (wrapped !== null && argument !== undefined) {
    return { decorator, evidence: wrapped, middleware: argument };
  }
  const metadata = declaredMetadataName(target);
  if (metadata !== null && CHAIN_DECORATORS_WITHOUT_CLASS.includes(metadata)) {
    return { decorator, evidence: decorator, middleware: null };
  }
  return null;
};

/** UseMiddleware を包む factory は1段だけ辿る(@RateLimit など) */
const wrappedRegistration = (
  ctx: ZeltContext,
  decorator: ts.Decorator,
  callee: ts.Node,
): Registration | null => {
  for (const declaration of resolveSymbol(ctx.checker, callee)?.declarations ?? []) {
    const registration = registrationFromDeclaration(ctx, decorator, declaration);
    if (registration !== null) return registration;
  }
  return null;
};

/** decorator が middleware chain に足す登録かを、Zelt の decorator 実装から判定する */
const registrationOf = (ctx: ZeltContext, decorator: ts.Decorator): Registration | null => {
  const callee = decoratorCallee(decorator);
  if (anchorOf(ctx, callee) !== 'UseMiddleware') return wrappedRegistration(ctx, decorator, callee);
  const argument = decoratorArguments(decorator)[0];
  return argument === undefined ? null : { decorator, evidence: decorator, middleware: argument };
};

export const registrationsOf = (
  ctx: ZeltContext,
  node: ts.HasDecorators,
): readonly Registration[] =>
  (ts.getDecorators(node) ?? []).flatMap((decorator) => {
    const registration = registrationOf(ctx, decorator);
    return registration === null ? [] : [registration];
  });
