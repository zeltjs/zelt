import ts from 'typescript';
import type {
  ClassRef,
  CoreResolver,
  Diagnostic,
  Material,
  OriginContext,
  ResolvedConfig,
  ResolvedScope,
  SetupDetail,
  Span,
} from '../core';
import { callIdOf, classDeclarationOf, classRefOf } from '../core';
import {
  arrayElementsOf,
  decoratorCallee,
  propertyOf,
  resolveSymbol,
  unwrapAssertion,
} from './zelt-runtime.lib';

export type TestSetupInput = {
  readonly checker: ts.TypeChecker;
  readonly config: ResolvedConfig;
  readonly resolver: CoreResolver;
  readonly scopes: readonly ResolvedScope[];
};

export type TestSetupOutput = {
  readonly materials: readonly Material[];
  readonly diagnostics: readonly Diagnostic[];
  readonly inspectedFiles: readonly string[];
};

const TESTING_MODULE = '@zeltjs/testing';
const CORE_MODULE = '@zeltjs/core';

type SetupContext = {
  readonly input: TestSetupInput;
  readonly origin: OriginContext;
  readonly diagnostics: Diagnostic[];
  readonly factories: ReadonlySet<ts.Declaration>;
  readonly injects: ReadonlySet<ts.Declaration>;
  readonly configs: ReadonlySet<ts.Declaration>;
  /** 地図で意識しない class。Solitary / Sociable の判断に混ぜない(付録F) */
  readonly ignored: ReadonlySet<ts.Declaration>;
};

const createSetupContext = (input: TestSetupInput): SetupContext => {
  const resolver = input.resolver;
  const declarationSet = (
    specifier: string,
    names: readonly string[],
  ): ReadonlySet<ts.Declaration> => new Set(resolver.exportsOf(specifier, names));
  return {
    input,
    origin: {
      checker: input.checker,
      spanOf: (node) => resolver.spanOf(node),
      relativePath: resolver.relativePath,
    },
    diagnostics: [],
    factories: declarationSet(TESTING_MODULE, ['createTestTarget']),
    injects: declarationSet(CORE_MODULE, ['inject']),
    configs: declarationSet(CORE_MODULE, ['Config']),
    ignored: new Set(
      input.config.raw.ignore.flatMap((entry) => [
        ...resolver.exportsOf(entry.package, entry.exports),
      ]),
    ),
  };
};

const spanOf = (ctx: SetupContext, node: ts.Node): Span => ctx.input.resolver.spanOf(node);

const isOneOf = (ctx: SetupContext, node: ts.Node, known: ReadonlySet<ts.Declaration>): boolean =>
  (resolveSymbol(ctx.input.checker, node)?.declarations ?? []).some((declaration) =>
    known.has(declaration),
  );

const note = (ctx: SetupContext, code: string, message: string, span: Span): void => {
  ctx.diagnostics.push({ code, message, subject: null, spans: [span] });
};

const isConfigClass = (ctx: SetupContext, cls: ts.ClassDeclaration): boolean =>
  (ts.getDecorators(cls) ?? []).some((decorator) =>
    isOneOf(ctx, decoratorCallee(decorator), ctx.configs),
  );

const baseClassOf = (ctx: SetupContext, cls: ts.ClassDeclaration): ts.ClassDeclaration | null => {
  for (const clause of cls.heritageClauses ?? []) {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
    for (const type of clause.types) {
      const base = classDeclarationOf(ctx.origin, type.expression);
      if (base !== null) return base;
    }
  }
  return null;
};

/** constructor を書いていない class は基底の constructor が DI を決める(付録F) */
const constructorOf = (
  ctx: SetupContext,
  cls: ts.ClassDeclaration,
  depth = 0,
): ts.ConstructorDeclaration | null => {
  const own = cls.members.find(ts.isConstructorDeclaration);
  if (own !== undefined) return own;
  const base = depth > 8 ? null : baseClassOf(ctx, cls);
  return base === null ? null : constructorOf(ctx, base, depth + 1);
};

const injectCallOf = (
  ctx: SetupContext,
  parameter: ts.ParameterDeclaration,
): ts.CallExpression | null => {
  const initializer = parameter.initializer;
  if (initializer === undefined || !ts.isCallExpression(initializer)) return null;
  return isOneOf(ctx, initializer.expression, ctx.injects) ? initializer : null;
};

const dependencyOf = (
  ctx: SetupContext,
  parameter: ts.ParameterDeclaration,
): SetupDetail['dependencies'][number] | null => {
  const call = injectCallOf(ctx, parameter);
  if (call === null) return null;
  const injected = classDeclarationOf(ctx.origin, call.arguments[0]);
  if (injected === null) {
    note(
      ctx,
      'zelt-setup-provider-unresolved',
      'inject target is not a class',
      spanOf(ctx, parameter),
    );
    return null;
  }
  if (ctx.ignored.has(injected)) return null;
  const ref = classRefOf(ctx.origin, injected);
  if (ref === null) return null;
  return { provide: ref, kind: isConfigClass(ctx, injected) ? 'config' : 'service' };
};

const dependenciesOf = (
  ctx: SetupContext,
  cls: ts.ClassDeclaration,
): SetupDetail['dependencies'] => {
  const ctor = constructorOf(ctx, cls);
  if (ctor === null) return [];
  return ctor.parameters.flatMap((parameter) => dependencyOf(ctx, parameter) ?? []);
};

const classRefsOf = (
  ctx: SetupContext,
  property: ts.PropertyAssignment | undefined,
  pick: (element: ts.Expression) => ts.Expression | undefined,
): readonly ClassRef[] => {
  if (property === undefined) return [];
  const elements = arrayElementsOf(unwrapAssertion(property.initializer));
  return elements.flatMap((element) => {
    const target = pick(unwrapAssertion(element));
    const cls = classDeclarationOf(ctx.origin, target);
    const ref = cls === null ? null : classRefOf(ctx.origin, cls);
    if (ref === null) {
      note(ctx, 'zelt-setup-entry-unresolved', 'setup entry is not a class', spanOf(ctx, element));
      return [];
    }
    return [ref];
  });
};

const optionsOf = (rawOptions: ts.Expression | undefined): ts.ObjectLiteralExpression | null => {
  const unwrapped = rawOptions === undefined ? undefined : unwrapAssertion(rawOptions);
  return unwrapped !== undefined && ts.isObjectLiteralExpression(unwrapped) ? unwrapped : null;
};

const noteDynamicOptions = (
  ctx: SetupContext,
  rawOptions: ts.Expression | undefined,
  options: ts.ObjectLiteralExpression | null,
): boolean => {
  if (rawOptions === undefined || options !== null) return false;
  note(
    ctx,
    'zelt-setup-dynamic-options',
    'test target options are not static',
    spanOf(ctx, rawOptions),
  );
  return true;
};

const setupDetailOf = (
  ctx: SetupContext,
  targetClass: ts.ClassDeclaration,
  options: ts.ObjectLiteralExpression | null,
): SetupDetail => ({
  dependencies: dependenciesOf(ctx, targetClass),
  configs: classRefsOf(
    ctx,
    options === null ? undefined : propertyOf(options, 'configs'),
    (e) => e,
  ),
  // useValue の中身は配信しない。差し替え対象の class だけを持つ(付録F)
  overrides: classRefsOf(
    ctx,
    options === null ? undefined : propertyOf(options, 'overrides'),
    (element) =>
      ts.isObjectLiteralExpression(element)
        ? propertyOf(element, 'provide')?.initializer
        : undefined,
  ).map((provide) => ({ provide })),
});

const recordTestSetup = (
  ctx: SetupContext,
  materials: Material[],
  node: ts.CallExpression,
): void => {
  const targetClass = classDeclarationOf(ctx.origin, node.arguments[0]);
  const ref = targetClass === null ? null : classRefOf(ctx.origin, targetClass);
  if (targetClass === null || ref === null) {
    note(ctx, 'zelt-setup-target-unresolved', 'test target is not a class', spanOf(ctx, node));
    return;
  }
  const rawOptions = node.arguments[1];
  const options = optionsOf(rawOptions);
  const dynamic = noteDynamicOptions(ctx, rawOptions, options);
  const span = spanOf(ctx, node);
  materials.push({
    kind: 'test-setup',
    value: {
      factoryCall: callIdOf(span),
      resultPath: ['target'],
      targetClass: ref,
      location: span,
      analysis: dynamic
        ? { kind: 'unresolved', reason: 'dynamic-setup' }
        : { kind: 'zelt', detail: setupDetailOf(ctx, targetClass, options) },
    },
  });
};

const visitSetups = (ctx: SetupContext, materials: Material[], node: ts.Node): void => {
  if (ts.isCallExpression(node) && isOneOf(ctx, node.expression, ctx.factories)) {
    recordTestSetup(ctx, materials, node);
  }
  ts.forEachChild(node, (child) => {
    visitSetups(ctx, materials, child);
  });
};

/**
 * `createTestTarget` の呼出から Unit の setup(対象 class・DI・config 差し替え)を読む。
 * runner の登録には触れないので、Vitest 以外の runner でも同じ材料が出る(付録C・F)。
 */
export const analyzeZeltTestSetups = (input: TestSetupInput): TestSetupOutput => {
  const ctx = createSetupContext(input);
  const materials: Material[] = [];
  const inspectedFiles: string[] = [];
  for (const resolved of input.scopes) {
    if (resolved.scope.category !== 'unit') continue;
    for (const file of resolved.files) {
      inspectedFiles.push(input.resolver.relativePath(file.fileName));
      visitSetups(ctx, materials, file);
    }
  }
  return { materials, diagnostics: ctx.diagnostics, inspectedFiles };
};
