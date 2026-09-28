import { dirname, resolve } from 'node:path';

import ts from 'typescript';
import type {
  AnalysisReport,
  AnalysisScope,
  CoreResolver,
  Diagnostic,
  ExportReference,
  Feature,
  Material,
  OriginContext,
  PluginResult,
  ResolvedConfig,
  ResolvedScope,
  Span,
  TestScopeConfig,
} from '../core';
import { callIdOf, resolveScopes, traceOrigin, unwrapExpression } from '../core';
import { propertyOf, resolveSymbol, stringLiteralOf, unwrapAssertion } from './zelt-runtime.lib';

export const HTTP_REQUESTS_PROVIDER = 'http-requests';

export const HTTP_REQUESTS_FEATURES: readonly Feature[] = ['requests', 'e2e-associations'];

/** テンプレートの置換部分。1 segment 全体を占めるときだけ `:parameter` に照合する(付録G) */
export const PATH_PARAMETER = '${}';
const MARK = '\u0000';

export type StringInput = { kind: 'literal'; value: string } | { kind: 'argument'; index: number };

export type RequestHelperConfig = {
  readonly function: ExportReference;
  readonly applicationArgument: number;
  readonly method: StringInput;
  readonly path: StringInput;
};

export type RequestApplicationConfig = {
  readonly id: string;
  readonly factory: ExportReference;
  readonly resultPath: readonly string[];
};

export type HttpRequestsInput = {
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly config: ResolvedConfig;
  readonly resolver: CoreResolver;
  readonly scopes: readonly TestScopeConfig[];
  readonly applications: readonly RequestApplicationConfig[];
  readonly helpers: readonly RequestHelperConfig[];
  readonly revision: string;
};

type RequestShape = { readonly method: string; readonly path: string };

const reportId = (feature: Feature, scope: TestScopeConfig): string =>
  `report:${JSON.stringify([HTTP_REQUESTS_PROVIDER, feature, scope.category, scope.files])}`;

const moduleSymbolOf = (
  program: ts.Program,
  checker: ts.TypeChecker,
  root: string,
  filePath: string,
): ts.Symbol | undefined => {
  const file = program.getSourceFile(resolve(root, filePath).replaceAll('\\', '/'));
  return file === undefined ? undefined : checker.getSymbolAtLocation(file);
};

const exportDeclarationOf = (
  program: ts.Program,
  checker: ts.TypeChecker,
  root: string,
  reference: ExportReference,
): ts.Declaration | null => {
  const moduleSymbol = moduleSymbolOf(program, checker, root, reference.filePath);
  if (moduleSymbol === undefined) return null;
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    if (symbol.name !== reference.exportName) continue;
    const resolved =
      (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
    const declaration = (resolved.declarations ?? [])[0];
    if (declaration !== undefined) return declaration;
  }
  return null;
};

const functionBodyOf = (declaration: ts.Declaration): ts.ConciseBody | null => {
  if (ts.isFunctionDeclaration(declaration)) return declaration.body ?? null;
  if (ts.isVariableDeclaration(declaration)) {
    const initializer = declaration.initializer;
    if (initializer === undefined) return null;
    const inner = unwrapExpression(initializer);
    if (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) return inner.body;
  }
  return null;
};

/** 関数本体が「式1つ」か「return 1つ」のときだけ、その式を展開対象にする(付録G) */
const singleExpressionOf = (body: ts.ConciseBody): ts.Expression | null => {
  if (!ts.isBlock(body)) return body;
  const statements = body.statements.filter((statement) => !ts.isEmptyStatement(statement));
  const only = statements.length === 1 ? statements[0] : undefined;
  if (only !== undefined && ts.isReturnStatement(only) && only.expression !== undefined) {
    return only.expression;
  }
  return null;
};

type RequestContext = {
  readonly input: HttpRequestsInput;
  readonly origin: OriginContext;
  readonly diagnostics: Map<string, Diagnostic[]>;
  /** core の http feature が置かれたディレクトリ。名前ではなく所在で判定するため */
  readonly coreDir: string | null;
  readonly applicationFactories: ReadonlyMap<ts.Declaration, RequestApplicationConfig>;
  readonly helperFunctions: ReadonlyMap<ts.Declaration, RequestHelperConfig>;
};

const createContext = (input: HttpRequestsInput): RequestContext => {
  const coreEntry = input.config.sourceModules['@zeltjs/core'];
  const applicationFactories = new Map<ts.Declaration, RequestApplicationConfig>();
  for (const application of input.applications) {
    const declaration = exportDeclarationOf(
      input.program,
      input.checker,
      input.config.root,
      application.factory,
    );
    if (declaration !== null) applicationFactories.set(declaration, application);
  }
  const helperFunctions = new Map<ts.Declaration, RequestHelperConfig>();
  for (const helper of input.helpers) {
    const declaration = exportDeclarationOf(
      input.program,
      input.checker,
      input.config.root,
      helper.function,
    );
    if (declaration !== null) helperFunctions.set(declaration, helper);
  }
  return {
    input,
    origin: {
      checker: input.checker,
      spanOf: (node) => input.resolver.spanOf(node),
      relativePath: input.resolver.relativePath,
    },
    diagnostics: new Map(),
    coreDir: coreEntry === undefined ? null : `${dirname(coreEntry)}/`,
    applicationFactories,
    helperFunctions,
  };
};

const spanOf = (ctx: RequestContext, node: ts.Node): Span => ctx.input.resolver.spanOf(node);

const declarationsOf = (ctx: RequestContext, node: ts.Node): readonly ts.Declaration[] =>
  resolveSymbol(ctx.input.checker, node)?.declarations ?? [];

const lookup = <T>(
  ctx: RequestContext,
  node: ts.Node,
  table: ReadonlyMap<ts.Declaration, T>,
): T | null => {
  for (const declaration of declarationsOf(ctx, node)) {
    const found = table.get(declaration);
    if (found !== undefined) return found;
  }
  return null;
};

const aliasInitializerOf = (
  checker: ts.TypeChecker,
  inner: ts.Expression,
): ts.Expression | undefined => {
  if (!ts.isIdentifier(inner)) return undefined;
  const declaration = checker.getSymbolAtLocation(inner)?.valueDeclaration;
  return declaration !== undefined && ts.isVariableDeclaration(declaration)
    ? declaration.initializer
    : undefined;
};

const staticStringOf = (
  checker: ts.TypeChecker,
  node: ts.Expression | undefined,
  depth = 0,
): string | null => {
  if (node === undefined || depth > 4) return null;
  const inner = unwrapAssertion(node);
  const literal = stringLiteralOf(inner);
  if (literal !== null) return literal;
  const alias = aliasInitializerOf(checker, inner);
  return alias === undefined ? null : staticStringOf(checker, alias, depth + 1);
};

const rawPathOf = (checker: ts.TypeChecker, inner: ts.Expression): string | null => {
  const literal = staticStringOf(checker, inner);
  if (literal !== null) return literal;
  if (!ts.isTemplateExpression(inner)) return null;
  let raw = inner.head.text;
  for (const span of inner.templateSpans) raw += MARK + span.literal.text;
  return raw;
};

const normalizePath = (raw: string): string | null => {
  const withoutQuery = (raw.split('?')[0] ?? '').split('#')[0] ?? '';
  const segments = withoutQuery.split('/');
  if (segments.some((segment) => segment.includes(MARK) && segment !== MARK)) return null;
  return segments.map((segment) => (segment === MARK ? PATH_PARAMETER : segment)).join('/');
};

/** URL は literal・不変 alias・1 segment 全体を占めるテンプレートまで(付録G) */
const pathOf = (ctx: RequestContext, node: ts.Expression | undefined): string | null => {
  if (node === undefined) return null;
  const raw = rawPathOf(ctx.input.checker, unwrapAssertion(node));
  return raw === null ? null : normalizePath(raw);
};

/** `<app>.http.request(…)` のとき、その app 式を返す */
const directApplicationOf = (ctx: RequestContext, callee: ts.Expression): ts.Expression | null => {
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'request') return null;
  const holder = unwrapExpression(callee.expression);
  if (!ts.isPropertyAccessExpression(holder) || holder.name.text !== 'http') return null;
  const coreDir = ctx.coreDir;
  if (coreDir === null) return null;
  // 名前ではなく、解決した宣言が core の http feature にあることで判定する(4.4)
  const known = declarationsOf(ctx, callee.name).some((declaration) =>
    declaration.getSourceFile().fileName.startsWith(coreDir),
  );
  return known ? holder.expression : null;
};

const directShapeOf = (ctx: RequestContext, call: ts.CallExpression): RequestShape | null => {
  const path = pathOf(ctx, call.arguments[0]);
  if (path === null) return null;
  const rawInit = call.arguments[1];
  if (rawInit === undefined) return { method: 'GET', path };
  const init = unwrapAssertion(rawInit);
  if (!ts.isObjectLiteralExpression(init)) return null;
  const method = propertyOf(init, 'method');
  if (method === undefined) return { method: 'GET', path };
  const value = staticStringOf(ctx.input.checker, method.initializer);
  return value === null ? null : { method: value.toUpperCase(), path };
};

const inputValueOf = (
  call: ts.CallExpression,
  source: StringInput,
  read: (node: ts.Expression | undefined) => string | null,
): string | null => (source.kind === 'literal' ? source.value : read(call.arguments[source.index]));

const helperShapeOf = (
  ctx: RequestContext,
  call: ts.CallExpression,
  helper: RequestHelperConfig,
): RequestShape | null => {
  const method = inputValueOf(call, helper.method, (node) =>
    staticStringOf(ctx.input.checker, node),
  );
  const path = inputValueOf(call, helper.path, (node) => pathOf(ctx, node));
  if (method === null || path === null) return null;
  return { method: method.toUpperCase(), path };
};

/** 呼出そのものが request かを判定する。app 式は呼出の書かれた場所で解決する */
const requestAt = (
  ctx: RequestContext,
  call: ts.CallExpression,
): { readonly shape: RequestShape; readonly application: ts.Expression } | null => {
  const callee = unwrapExpression(call.expression);
  const app = directApplicationOf(ctx, callee);
  if (app !== null) {
    const shape = directShapeOf(ctx, call);
    return shape === null ? null : { shape, application: app };
  }
  const helper = lookup(ctx, callee, ctx.helperFunctions);
  if (helper === null) return null;
  const shape = helperShapeOf(ctx, call, helper);
  const application = call.arguments[helper.applicationArgument];
  if (shape === null || application === undefined) return null;
  return { shape, application };
};

const containsRequest = (ctx: RequestContext, body: ts.Node): boolean => {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);
      if (
        directApplicationOf(ctx, callee) !== null ||
        lookup(ctx, callee, ctx.helperFunctions) !== null
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
};

const localHelpersOf = (file: ts.SourceFile): Map<ts.Declaration, ts.Expression> => {
  const helpers = new Map<ts.Declaration, ts.Expression>();
  // export しない局所 helper は suite の中にも書かれるので、ファイル全体から集める(付録G)
  const step = (node: ts.Node): void => {
    if (
      ts.isVariableStatement(node) &&
      !(ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of node.declarationList.declarations) {
        const body = functionBodyOf(declaration);
        const only = body === null ? null : singleExpressionOf(body);
        if (only !== null) helpers.set(declaration, only);
      }
    }
    ts.forEachChild(node, step);
  };
  step(file);
  return helpers;
};

type FileScan = {
  readonly ctx: RequestContext;
  readonly scope: AnalysisScope;
  readonly localHelpers: ReadonlyMap<ts.Declaration, ts.Expression>;
  readonly expanded: ReadonlySet<ts.Node>;
  readonly materials: Material[];
};

const note = (
  scan: FileScan,
  feature: Feature,
  code: string,
  message: string,
  node: ts.Node,
): void => {
  const key = reportId(feature, scan.scope);
  const list = scan.ctx.diagnostics.get(key) ?? [];
  list.push({ code, message, subject: null, spans: [spanOf(scan.ctx, node)] });
  scan.ctx.diagnostics.set(key, list);
};

const emitApplication = (
  scan: FileScan,
  node: ts.CallExpression,
  application: RequestApplicationConfig,
): void => {
  scan.materials.push({
    kind: 'application',
    value: {
      factoryCall: callIdOf(spanOf(scan.ctx, node)),
      resultPath: application.resultPath,
      applicationId: application.id,
    },
  });
};

const emitRequest = (
  scan: FileScan,
  invocation: Span,
  shape: RequestShape,
  application: ts.Expression,
  via: 'direct' | 'helper',
): void => {
  scan.materials.push({
    kind: 'request',
    value: {
      invocation,
      application: traceOrigin(scan.ctx.origin, application),
      method: shape.method,
      path: shape.path,
      via,
    },
  });
};

const noteUnexpandable = (scan: FileScan, node: ts.CallExpression, callee: ts.Identifier): void => {
  for (const declaration of declarationsOf(scan.ctx, callee)) {
    const body = functionBodyOf(declaration);
    if (body === null || !containsRequest(scan.ctx, body)) continue;
    // 展開できない経路が残るので、この範囲は「一部のみ」になる(付録G)
    note(
      scan,
      'e2e-associations',
      'http-unsupported-request-path',
      `${callee.text} sends requests that this version cannot expand`,
      node,
    );
  }
};

const expandLocalHelper = (
  scan: FileScan,
  node: ts.CallExpression,
  callee: ts.Expression,
): void => {
  const local = lookup(scan.ctx, callee, scan.localHelpers);
  const body = local === null ? null : unwrapExpression(local);
  if (body !== null && ts.isCallExpression(body)) {
    // 局所 helper は、本体の request 1本をその呼出位置へ展開する(付録G)
    const inner = requestAt(scan.ctx, body);
    if (inner !== null) {
      emitRequest(scan, spanOf(scan.ctx, node), inner.shape, inner.application, 'helper');
      return;
    }
    note(scan, 'requests', 'http-helper-unresolved', 'local helper request is not static', node);
    return;
  }
  if (local === null && ts.isIdentifier(callee)) noteUnexpandable(scan, node, callee);
};

const emitOrExpand = (
  scan: FileScan,
  node: ts.CallExpression,
  callee: ts.Expression,
  application: RequestApplicationConfig | null,
): void => {
  const direct = requestAt(scan.ctx, node);
  if (direct !== null) {
    emitRequest(
      scan,
      spanOf(scan.ctx, node),
      direct.shape,
      direct.application,
      ts.isPropertyAccessExpression(callee) ? 'direct' : 'helper',
    );
    return;
  }
  if (application === null) expandLocalHelper(scan, node, callee);
};

const visitCallChildren = (
  scan: FileScan,
  node: ts.CallExpression,
  callee: ts.Expression,
): void => {
  if (ts.isPropertyAccessExpression(callee)) visitRequests(scan, callee.expression);
  for (const argument of node.arguments) visitRequests(scan, argument);
};

const visitCall = (scan: FileScan, node: ts.CallExpression): void => {
  const callee = unwrapExpression(node.expression);
  const application = lookup(scan.ctx, callee, scan.ctx.applicationFactories);
  if (application !== null) emitApplication(scan, node, application);
  // 展開した helper 本体の request は、呼出位置のほうで数える
  if (scan.expanded.has(node)) {
    for (const argument of node.arguments) visitRequests(scan, argument);
    return;
  }
  emitOrExpand(scan, node, callee, application);
  visitCallChildren(scan, node, callee);
};

function visitRequests(scan: FileScan, node: ts.Node): void {
  if (ts.isCallExpression(node)) {
    visitCall(scan, node);
    return;
  }
  ts.forEachChild(node, (child) => {
    visitRequests(scan, child);
  });
}

type Collected = {
  readonly materials: Material[];
  readonly inspectedByCategory: Map<string, string[]>;
};

const collectRequests = (ctx: RequestContext, scopes: readonly ResolvedScope[]): Collected => {
  const materials: Material[] = [];
  const inspectedByCategory = new Map<string, string[]>();
  for (const resolved of scopes) {
    inspectedByCategory.set(
      resolved.scope.category,
      resolved.files.map((file) => ctx.input.resolver.relativePath(file.fileName)),
    );
    for (const file of resolved.files) {
      const localHelpers = localHelpersOf(file);
      visitRequests(
        {
          ctx,
          scope: resolved.scope,
          localHelpers,
          expanded: new Set(localHelpers.values()),
          materials,
        },
        file,
      );
    }
  }
  return { materials, inspectedByCategory };
};

const buildReports = (
  ctx: RequestContext,
  scopes: readonly ResolvedScope[],
  inspectedByCategory: ReadonlyMap<string, string[]>,
): AnalysisReport[] => {
  const reports: AnalysisReport[] = [];
  for (const resolved of scopes) {
    const scope = resolved.scope;
    for (const feature of HTTP_REQUESTS_FEATURES) {
      const id = reportId(feature, scope);
      const found = ctx.diagnostics.get(id) ?? [];
      reports.push({
        id,
        provider: HTTP_REQUESTS_PROVIDER,
        feature,
        status: found.length > 0 ? 'partial' : 'complete-in-scope',
        scope,
        inspectedFiles: inspectedByCategory.get(scope.category) ?? [],
        diagnostics: found,
      });
    }
  }
  return reports;
};

export const analyzeHttpRequests = (input: HttpRequestsInput): PluginResult => {
  const ctx = createContext(input);
  const scopes = resolveScopes(
    input.program,
    input.config,
    input.resolver.relativePath,
    input.scopes,
  );

  const collected = collectRequests(ctx, scopes);
  return {
    revision: input.revision,
    materials: collected.materials,
    reports: buildReports(ctx, scopes, collected.inspectedByCategory),
    ignoreRecommendations: [],
  };
};
