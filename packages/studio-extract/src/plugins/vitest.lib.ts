import ts from 'typescript';
import type {
  AnalysisReport,
  AnalysisScope,
  ClassRef,
  CoreResolver,
  Diagnostic,
  Feature,
  Material,
  OriginContext,
  PluginResult,
  ResolvedConfig,
  ResolvedScope,
  Span,
  TestCall,
  TestContribution,
  TestScopeConfig,
} from '../core';
import { classRefOf, locationIdOf, resolveScopes, traceOrigin, unwrapExpression } from '../core';

export const VITEST_PROVIDER = 'vitest';

export const VITEST_FEATURES: readonly Feature[] = ['tests', 'unit-associations'];

const SUITE_NAMES: readonly string[] = ['describe', 'suite'];
const CASE_NAMES: readonly string[] = ['it', 'test'];
const HOOK_NAMES: readonly string[] = ['beforeEach', 'beforeAll', 'afterEach', 'afterAll'];
/** 登録の形を変えない modifier。`each` のような展開が要るものは未対応にする */
const KNOWN_MODIFIERS: readonly string[] = [
  'skip',
  'only',
  'todo',
  'fails',
  'concurrent',
  'sequential',
  'runIf',
  'skipIf',
];

const MODES: Readonly<Record<string, TestContribution['mode']>> = {
  skip: 'skip',
  only: 'only',
  todo: 'todo',
};

export type VitestInput = {
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly config: ResolvedConfig;
  readonly resolver: CoreResolver;
  readonly scopes: readonly TestScopeConfig[];
  readonly globals: boolean;
  readonly revision: string;
};

type Registration = {
  readonly role: 'suite' | 'case' | 'hook';
  readonly mode: TestContribution['mode'];
};

const reportId = (feature: Feature, scope: TestScopeConfig): string =>
  `report:${JSON.stringify([VITEST_PROVIDER, feature, scope.category, scope.files])}`;

const vitestNamedImports = (statement: ts.Statement): ts.NamedImports | null => {
  if (!ts.isImportDeclaration(statement)) return null;
  if (
    !ts.isStringLiteral(statement.moduleSpecifier) ||
    statement.moduleSpecifier.text !== 'vitest'
  ) {
    return null;
  }
  const named = statement.importClause?.namedBindings;
  return named !== undefined && ts.isNamedImports(named) ? named : null;
};

/** import 元が vitest の binding だけを登録とみなす(付録F)。globals は config が明示したときだけ */
const bindingsOf = (file: ts.SourceFile, globals: boolean): ReadonlyMap<string, string> => {
  const bindings = new Map<string, string>();
  if (globals) {
    for (const name of [...SUITE_NAMES, ...CASE_NAMES, ...HOOK_NAMES]) bindings.set(name, name);
  }
  for (const statement of file.statements) {
    const named = vitestNamedImports(statement);
    if (named === null) continue;
    for (const element of named.elements) {
      bindings.set(element.name.text, (element.propertyName ?? element.name).text);
    }
  }
  return bindings;
};

/** `describe.skip(…)` の左端 identifier と、その間に挟まる property 名を取り出す */
const calleeChain = (
  expression: ts.Expression,
): { readonly root: ts.Identifier; readonly modifiers: readonly string[] } | null => {
  const modifiers: string[] = [];
  let current = unwrapExpression(expression);
  for (;;) {
    if (ts.isPropertyAccessExpression(current)) {
      modifiers.unshift(current.name.text);
      current = unwrapExpression(current.expression);
      continue;
    }
    if (ts.isCallExpression(current)) {
      current = unwrapExpression(current.expression);
      continue;
    }
    break;
  }
  return ts.isIdentifier(current) ? { root: current, modifiers } : null;
};

const asFunction = (
  node: ts.Expression | undefined,
): ts.FunctionExpression | ts.ArrowFunction | null => {
  if (node === undefined) return null;
  const inner = unwrapExpression(node);
  return ts.isArrowFunction(inner) || ts.isFunctionExpression(inner) ? inner : null;
};

const staticTextOf = (node: ts.Expression | undefined): string | null => {
  if (node === undefined) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node) && node.templateSpans.length === 0) return node.head.text;
  return null;
};

type VitestContext = {
  readonly input: VitestInput;
  readonly origin: OriginContext;
  readonly diagnostics: Map<string, Diagnostic[]>;
};

const spanOf = (ctx: VitestContext, node: ts.Node): Span => ctx.input.resolver.spanOf(node);

const note = (
  ctx: VitestContext,
  entry: {
    readonly feature: Feature;
    readonly scope: TestScopeConfig;
    readonly code: string;
    readonly message: string;
    readonly node: ts.Node;
  },
): void => {
  const key = reportId(entry.feature, entry.scope);
  const list = ctx.diagnostics.get(key) ?? [];
  list.push({
    code: entry.code,
    message: entry.message,
    subject: null,
    spans: [spanOf(ctx, entry.node)],
  });
  ctx.diagnostics.set(key, list);
};

const isAppDeclaration = (ctx: VitestContext, declaration: ts.Declaration): boolean =>
  ctx.input.config.isIncluded(
    ctx.input.resolver.relativePath(declaration.getSourceFile().fileName),
  );

const getterOf = (ctx: VitestContext, name: ts.MemberName): ts.GetAccessorDeclaration | null => {
  const symbol = ctx.input.checker.getSymbolAtLocation(name);
  for (const declaration of symbol?.declarations ?? []) {
    if (ts.isGetAccessorDeclaration(declaration)) return declaration;
  }
  return null;
};

const ownerClassOf = (ctx: VitestContext, declaration: ts.Declaration): ClassRef | null =>
  ts.isClassDeclaration(declaration.parent) ? classRefOf(ctx.origin, declaration.parent) : null;

type CallSite = {
  readonly declaration: ts.Declaration;
  readonly invocation: ts.Node;
  readonly receiver: ts.Expression | null;
};

const recordCall = (ctx: VitestContext, calls: Map<string, TestCall>, site: CallSite): void => {
  if (!isAppDeclaration(ctx, site.declaration)) return;
  const subject = ctx.input.resolver.subjectOf(site.declaration);
  if (subject === null) return;
  const at = spanOf(ctx, site.invocation);
  const key = `${subject}\u0000${at.start}`;
  if (calls.has(key)) return;
  calls.set(key, {
    subject,
    invocation: at,
    origin: site.receiver === null ? null : traceOrigin(ctx.origin, site.receiver),
    ownerClass: ownerClassOf(ctx, site.declaration),
  });
};

const recordCallee = (
  ctx: VitestContext,
  calls: Map<string, TestCall>,
  node: ts.CallExpression,
): void => {
  const callee = unwrapExpression(node.expression);
  if (!ts.isPropertyAccessExpression(callee)) {
    const declaration = ctx.input.checker.getResolvedSignature(node)?.declaration;
    if (declaration !== undefined) {
      recordCall(ctx, calls, { declaration, invocation: node, receiver: null });
    }
    return;
  }
  const accessed = getterOf(ctx, callee.name);
  if (accessed !== null) {
    // getter が返した関数の呼出は、読み取った getter への呼出として数える(4.1)
    recordCall(ctx, calls, {
      declaration: accessed,
      invocation: node,
      receiver: callee.expression,
    });
    return;
  }
  const declaration = ctx.input.checker.getResolvedSignature(node)?.declaration;
  if (declaration !== undefined) {
    recordCall(ctx, calls, { declaration, invocation: node, receiver: callee.expression });
  }
};

const visitCallChildren = (
  ctx: VitestContext,
  calls: Map<string, TestCall>,
  node: ts.CallExpression,
): void => {
  const callee = unwrapExpression(node.expression);
  if (ts.isPropertyAccessExpression(callee)) visitForCalls(ctx, calls, callee.expression);
  else if (!ts.isIdentifier(callee)) visitForCalls(ctx, calls, callee);
  for (const argument of node.arguments) visitForCalls(ctx, calls, argument);
};

function visitForCalls(ctx: VitestContext, calls: Map<string, TestCall>, node: ts.Node): void {
  if (ts.isCallExpression(node)) {
    recordCallee(ctx, calls, node);
    visitCallChildren(ctx, calls, node);
    return;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const accessed = getterOf(ctx, node.name);
    if (accessed !== null) {
      recordCall(ctx, calls, {
        declaration: accessed,
        invocation: node,
        receiver: node.expression,
      });
    }
    visitForCalls(ctx, calls, node.expression);
    return;
  }
  ts.forEachChild(node, (child) => {
    visitForCalls(ctx, calls, child);
  });
}

const collectCalls = (ctx: VitestContext, body: ts.Node): readonly TestCall[] => {
  const calls = new Map<string, TestCall>();
  visitForCalls(ctx, calls, body);
  return [...calls.values()].sort((a, b) => a.invocation.start - b.invocation.start);
};

type WalkContext = {
  readonly ctx: VitestContext;
  readonly scope: AnalysisScope;
  readonly bindings: ReadonlyMap<string, string>;
  readonly materials: Material[];
};

const roleOf = (imported: string): Registration['role'] | null => {
  if (SUITE_NAMES.includes(imported)) return 'suite';
  if (CASE_NAMES.includes(imported)) return 'case';
  if (HOOK_NAMES.includes(imported)) return 'hook';
  return null;
};

const registrationOf = (w: WalkContext, node: ts.CallExpression): Registration | null => {
  const chain = calleeChain(node.expression);
  if (chain === null) return null;
  const imported = w.bindings.get(chain.root.text);
  if (imported === undefined) return null;
  const role = roleOf(imported);
  if (role === null) return null;
  const unknown = chain.modifiers.filter((modifier) => !KNOWN_MODIFIERS.includes(modifier));
  if (unknown.length > 0) {
    note(w.ctx, {
      feature: 'tests',
      scope: w.scope,
      code: 'vitest-unsupported-modifier',
      message: `unsupported registration modifier: ${unknown.join('.')}`,
      node,
    });
    return null;
  }
  const mode = chain.modifiers.flatMap((modifier) => MODES[modifier] ?? []).at(0) ?? 'normal';
  return { role, mode };
};

const caseNameOf = (w: WalkContext, node: ts.CallExpression): string => {
  const rawName = node.arguments[0];
  const name = staticTextOf(rawName);
  if (name === null && rawName !== undefined) {
    // 名前は null を許さないので式のまま出し、解けなかったことは report で示す(付録N)
    note(w.ctx, {
      feature: 'tests',
      scope: w.scope,
      code: 'vitest-dynamic-name',
      message: 'test name is not static',
      node: rawName,
    });
  }
  return name ?? (rawName === undefined ? '(anonymous)' : rawName.getText());
};

const pushTestMaterial = (
  w: WalkContext,
  node: ts.CallExpression,
  test: {
    readonly label: string;
    readonly suite: readonly string[];
    readonly mode: TestContribution['mode'];
    readonly body: ts.Node | undefined;
  },
): void => {
  const at = spanOf(w.ctx, node);
  w.materials.push({
    kind: 'test',
    value: {
      registration: locationIdOf(at),
      caseKey: `${at.filePath}:${at.start}`,
      category: w.scope.category,
      name: test.label,
      suite: test.suite,
      location: at,
      body: test.body === undefined ? null : spanOf(w.ctx, test.body),
      mode: test.mode,
      calls: test.body === undefined ? [] : collectCalls(w.ctx, test.body),
    },
  });
};

const walkRegistration = (
  w: WalkContext,
  node: ts.CallExpression,
  registration: Registration,
  suite: readonly string[],
): void => {
  const label = caseNameOf(w, node);
  const body = asFunction(node.arguments[1])?.body;
  if (registration.role === 'suite') {
    if (body !== undefined) {
      ts.forEachChild(body, (child) => {
        walk(w, child, [...suite, label]);
      });
    }
    return;
  }
  pushTestMaterial(w, node, { label, suite, mode: registration.mode, body });
};

function walk(w: WalkContext, node: ts.Node, suite: readonly string[]): void {
  if (ts.isCallExpression(node)) {
    const registration = registrationOf(w, node);
    if (registration !== null && registration.role !== 'hook') {
      walkRegistration(w, node, registration, suite);
      return;
    }
  }
  ts.forEachChild(node, (child) => {
    walk(w, child, suite);
  });
}

const collectTests = (ctx: VitestContext, scopes: readonly ResolvedScope[]): Material[] => {
  const materials: Material[] = [];
  for (const resolved of scopes) {
    for (const file of resolved.files) {
      const w: WalkContext = {
        ctx,
        scope: resolved.scope,
        bindings: bindingsOf(file, ctx.input.globals),
        materials,
      };
      for (const statement of file.statements) walk(w, statement, []);
    }
  }
  return materials;
};

const buildReports = (ctx: VitestContext, scopes: readonly ResolvedScope[]): AnalysisReport[] => {
  const reports: AnalysisReport[] = [];
  for (const resolved of scopes) {
    const scope = resolved.scope;
    const files = resolved.files.map((file) => ctx.input.resolver.relativePath(file.fileName));
    for (const feature of VITEST_FEATURES) {
      if (feature === 'unit-associations' && scope.category !== 'unit') continue;
      const id = reportId(feature, scope);
      const found = ctx.diagnostics.get(id) ?? [];
      reports.push({
        id,
        provider: VITEST_PROVIDER,
        feature,
        status: found.length > 0 ? 'partial' : 'complete-in-scope',
        scope,
        inspectedFiles: files,
        diagnostics: found,
      });
    }
  }
  return reports;
};

export const analyzeVitest = (input: VitestInput): PluginResult => {
  const resolver = input.resolver;
  const ctx: VitestContext = {
    input,
    origin: {
      checker: input.checker,
      spanOf: (node) => resolver.spanOf(node),
      relativePath: resolver.relativePath,
    },
    diagnostics: new Map(),
  };
  const scopes = resolveScopes(input.program, input.config, resolver.relativePath, input.scopes);

  const materials = collectTests(ctx, scopes);
  return {
    revision: input.revision,
    materials,
    reports: buildReports(ctx, scopes),
    ignoreRecommendations: [],
  };
};
