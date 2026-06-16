import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { ControllerClass } from '../routing';
import { collectRoutes } from '../routing';

type TSProgram = import('typescript').Program;
type TypeScriptModule = typeof import('typescript');
type TSSourceFile = import('typescript').SourceFile;
type TSNode = import('typescript').Node;
type TSExpression = import('typescript').Expression;
type TSParameterDeclaration = import('typescript').ParameterDeclaration;
type TSCallExpression = import('typescript').CallExpression;
type TSImportDeclaration = import('typescript').ImportDeclaration;
type TSStatement = import('typescript').Statement;
type TSClassDeclaration = import('typescript').ClassDeclaration;

type Position = {
  readonly sourceFile: string;
  readonly line: number;
  readonly column: number;
};

type ParamInfo = {
  readonly name: string;
  readonly pos: Position | undefined;
};

type MethodInfo = {
  readonly name: string | symbol;
  readonly params: readonly ParamInfo[];
};

type ClassMetadata = {
  readonly methods: readonly MethodInfo[];
};

type InspectError = {
  readonly code: string;
  readonly message: string;
};

type InspectResult<T> = {
  readonly value?: T;
  readonly error?: InspectError;
  isErr(): boolean;
};

type CachedProgram = {
  readonly program: TSProgram;
  readonly ts: TypeScriptModule;
};

type InspectModule = {
  readonly getOrCreateProgram: (tsconfigPath: string) => PromiseLike<InspectResult<CachedProgram>>;
  readonly getSourcePosition: (cls: object) => Position | undefined;
};

type ModuleSpecifierMode = 'typescript' | 'node';
type ModuleSyntax = 'typescript' | 'javascript';

export type RuntimeImportMap = {
  readonly sourceRoot: string;
  readonly runtimeRoot: string;
};

export type RenderHttpInvocationModuleOptions = {
  readonly controllers: readonly ControllerClass[];
  readonly tsconfig: string;
  readonly out: string;
  /** Controls where the generated module imports validateBodyAsync from. */
  readonly coreImport?: string;
  readonly moduleSpecifierMode?: ModuleSpecifierMode;
  readonly moduleSyntax?: ModuleSyntax;
  readonly runtimeImportMap?: RuntimeImportMap;
};

export type GenerateHttpInvocationModuleOptions = RenderHttpInvocationModuleOptions;

export type GenerateHttpInvocationModuleResult = {
  readonly changed: boolean;
};

type InjectableExpression = {
  readonly expression: string;
  readonly usesCtx: boolean;
  readonly usesValidation: boolean;
};

type HookSpec = {
  readonly key: string;
  readonly params: readonly InjectableExpression[];
};

type ResolvedImport = {
  readonly modulePath: string;
  readonly exportName: string;
  readonly localName: string;
};

type HelperKind = 'body' | 'validated';

type RenderContext = {
  readonly program: TSProgram;
  readonly ts: TypeScriptModule;
  readonly out: string;
  readonly coreImport: string;
  readonly imports: ImportRegistry;
  readonly inspect: InspectModule;
};

type ImportEntry = {
  readonly moduleSpecifier: string;
  readonly exportName: string;
  readonly localName: string;
};

class ImportRegistry {
  readonly #entries: ImportEntry[] = [];
  readonly #mode: ModuleSpecifierMode;
  readonly #runtimeImportMap: RuntimeImportMap | undefined;
  readonly #usedNames = new Set<string>([
    'ctx',
    'validateBodyAsync',
    'HttpInvocationHookContext',
    'HttpInvocationHook',
    'httpInvocationHooks',
  ]);

  constructor(mode: ModuleSpecifierMode, runtimeImportMap: RuntimeImportMap | undefined) {
    this.#mode = mode;
    this.#runtimeImportMap = runtimeImportMap;
  }

  add(input: ResolvedImport, out: string): string {
    const moduleSpecifier = toGeneratedModuleSpecifier(
      out,
      input.modulePath,
      this.#mode,
      this.#runtimeImportMap,
    );
    const existing = this.#entries.find(
      (entry) =>
        entry.moduleSpecifier === moduleSpecifier &&
        entry.exportName === input.exportName &&
        entry.localName === input.localName,
    );
    if (existing) return existing.localName;

    const localName = this.#reserveName(input.localName);
    this.#entries.push({ moduleSpecifier, exportName: input.exportName, localName });
    return localName;
  }

  render(): readonly string[] {
    const grouped = new Map<string, ImportEntry[]>();
    for (const entry of this.#entries) {
      const entries = grouped.get(entry.moduleSpecifier) ?? [];
      entries.push(entry);
      grouped.set(entry.moduleSpecifier, entries);
    }

    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([moduleSpecifier, entries]) => {
        const specifiers = entries
          .map((entry) =>
            entry.exportName === entry.localName
              ? entry.exportName
              : `${entry.exportName} as ${entry.localName}`,
          )
          .join(', ');
        return `import { ${specifiers} } from '${moduleSpecifier}';`;
      });
  }

  #reserveName(preferred: string): string {
    if (!this.#usedNames.has(preferred)) {
      this.#usedNames.add(preferred);
      return preferred;
    }

    let suffix = 2;
    while (this.#usedNames.has(`${preferred}${suffix}`)) {
      suffix += 1;
    }
    const name = `${preferred}${suffix}`;
    this.#usedNames.add(name);
    return name;
  }
}

const stripKnownExtension = (path: string): string => path.replace(/\.(?:[cm]?[tj]sx?)$/, '');

const normalizePath = (path: string): string => path.replaceAll('\\', '/');

const NODE_EXTENSION_REPLACEMENTS: readonly [RegExp, string][] = [
  [/\.mts$/, '.mjs'],
  [/\.cts$/, '.cjs'],
  [/\.(?:tsx?|jsx)$/, '.js'],
];

const hasNodeRuntimeExtension = (path: string): boolean =>
  ['.mjs', '.cjs', '.js'].some((extension) => path.endsWith(extension));

const toNodeImportPath = (path: string): string => {
  if (hasNodeRuntimeExtension(path)) return path;
  const replacement = NODE_EXTENSION_REPLACEMENTS.find(([pattern]) => pattern.test(path));
  if (replacement) return path.replace(replacement[0], replacement[1]);
  return `${stripKnownExtension(path)}.js`;
};

const renderModulePath = (modulePath: string, mode: ModuleSpecifierMode): string =>
  mode === 'node' ? toNodeImportPath(modulePath) : stripKnownExtension(modulePath);

const isRelativeInsideRoot = (path: string): boolean =>
  path !== '' && !path.startsWith('..') && !isAbsolute(path);

const toRuntimeImportPath = (
  modulePath: string,
  runtimeImportMap: RuntimeImportMap | undefined,
): string => {
  if (runtimeImportMap === undefined) return modulePath;
  const sourceRoot = resolve(runtimeImportMap.sourceRoot);
  const sourcePath = resolve(modulePath);
  const relativeSourcePath = relative(sourceRoot, sourcePath);
  if (!isRelativeInsideRoot(relativeSourcePath)) return modulePath;
  return resolve(runtimeImportMap.runtimeRoot, relativeSourcePath);
};

const toGeneratedModuleSpecifier = (
  out: string,
  modulePath: string,
  mode: ModuleSpecifierMode,
  runtimeImportMap: RuntimeImportMap | undefined,
): string => {
  if (!modulePath.startsWith('.') && !modulePath.startsWith('/')) return modulePath;

  const outDir = dirname(resolve(out));
  const runtimeModulePath = toRuntimeImportPath(modulePath, runtimeImportMap);
  const resolvedModule = renderModulePath(resolve(runtimeModulePath), mode);
  const relativePath = normalizePath(relative(outDir, resolvedModule));
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
};

const writeIfChanged = async (path: string, content: string): Promise<boolean> => {
  if (existsSync(path)) {
    const existing = await readFile(path, 'utf8');
    if (existing === content) return false;
  }
  await writeFile(path, content, 'utf8');
  return true;
};

const findMethodInfo = (
  metadata: ClassMetadata,
  methodName: string | symbol,
): MethodInfo | undefined => metadata.methods.find((method) => method.name === methodName);

const findClassAtPosition = (
  sourceFile: TSSourceFile,
  offset: number,
  ts: TypeScriptModule,
): TSClassDeclaration | undefined => {
  const visit = (node: TSNode): TSClassDeclaration | undefined => {
    const child = ts.forEachChild(node, visit);
    if (child) return child;
    return ts.isClassDeclaration(node) && node.pos <= offset && offset < node.end
      ? node
      : undefined;
  };
  return visit(sourceFile);
};

const methodNameFromNode = (
  name: import('typescript').PropertyName,
  ts: TypeScriptModule,
): string | symbol => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
};

const parameterNameFromNode = (param: TSParameterDeclaration, ts: TypeScriptModule): string =>
  ts.isIdentifier(param.name) ? param.name.text : param.name.getText();

const positionFromNode = (
  sourceFile: TSSourceFile,
  node: TSNode,
  ts: TypeScriptModule,
): Position => {
  const point = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart());
  return {
    sourceFile: sourceFile.fileName,
    line: point.line + 1,
    column: point.character + 1,
  };
};

const methodInfoFromNode = (
  member: import('typescript').MethodDeclaration,
  sourceFile: TSSourceFile,
  ts: TypeScriptModule,
): MethodInfo => ({
  name: methodNameFromNode(member.name, ts),
  params: member.parameters.map((param) => ({
    name: parameterNameFromNode(param, ts),
    pos: positionFromNode(sourceFile, param, ts),
  })),
});

const buildClassMetadata = (
  classNode: TSClassDeclaration,
  sourceFile: TSSourceFile,
  ts: TypeScriptModule,
): ClassMetadata => ({
  methods: classNode.members
    .filter((member) => ts.isMethodDeclaration(member))
    .map((member) => methodInfoFromNode(member, sourceFile, ts)),
});

/** @throws {Error} */
const resolveControllerMetadata = (
  controller: ControllerClass,
  ctx: RenderContext,
): ClassMetadata => {
  const position = ctx.inspect.getSourcePosition(controller);
  if (!position) {
    throw new Error(`Failed to inspect ${controller.name} for HTTP invocation generation`);
  }
  const sourceFile = ctx.program.getSourceFile(position.sourceFile);
  if (!sourceFile) {
    throw new Error(`Failed to inspect ${controller.name}: source file not found`);
  }
  const offset = ctx.ts.getPositionOfLineAndCharacter(
    sourceFile,
    position.line - 1,
    position.column - 1,
  );
  const classNode = findClassAtPosition(sourceFile, offset, ctx.ts);
  if (!classNode) {
    throw new Error(`Failed to inspect ${controller.name}: class declaration not found`);
  }
  return buildClassMetadata(classNode, sourceFile, ctx.ts);
};

const findParameterAtPosition = (
  sourceFile: TSSourceFile,
  offset: number,
  ts: TypeScriptModule,
): TSParameterDeclaration | undefined => {
  const visit = (node: TSNode): TSParameterDeclaration | undefined => {
    if (node.getStart() === offset && ts.isParameter(node)) return node;
    return ts.forEachChild(node, visit);
  };
  return visit(sourceFile);
};

const getSourceFileForPosition = (program: TSProgram, pos: Position): TSSourceFile | undefined =>
  program.getSourceFile(pos.sourceFile);

const findParameterNode = (
  param: ParamInfo,
  ctx: RenderContext,
):
  | { readonly sourceFile: TSSourceFile; readonly parameter: TSParameterDeclaration }
  | undefined => {
  if (!param.pos) return undefined;
  const sourceFile = getSourceFileForPosition(ctx.program, param.pos);
  if (!sourceFile) return undefined;
  const offset = ctx.ts.getPositionOfLineAndCharacter(
    sourceFile,
    param.pos.line - 1,
    param.pos.column - 1,
  );
  const parameter = findParameterAtPosition(sourceFile, offset, ctx.ts);
  return parameter ? { sourceFile, parameter } : undefined;
};

const unwrapExpression = (expr: TSExpression, ts: TypeScriptModule): TSExpression => {
  let current = expr;
  while (
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
};

const getStringLiteral = (
  expr: TSExpression | undefined,
  ts: TypeScriptModule,
): string | undefined => {
  if (!expr) return undefined;
  const unwrapped = unwrapExpression(expr, ts);
  return ts.isStringLiteral(unwrapped) ? unwrapped.text : undefined;
};

const resolveRelativeImport = (sourceFile: TSSourceFile, moduleSpecifier: string): string => {
  if (!moduleSpecifier.startsWith('.')) return moduleSpecifier;
  return resolve(dirname(sourceFile.fileName), moduleSpecifier);
};

const getImportModuleSpecifier = (
  importDecl: TSImportDeclaration,
  ts: TypeScriptModule,
): string | undefined =>
  ts.isStringLiteral(importDecl.moduleSpecifier) ? importDecl.moduleSpecifier.text : undefined;

const getNamedImportElements = (
  namedBindings: import('typescript').NamedImportBindings | undefined,
  ts: TypeScriptModule,
): readonly import('typescript').ImportSpecifier[] => {
  if (!namedBindings || !ts.isNamedImports(namedBindings)) return [];
  return [...namedBindings.elements];
};

const importSpecifierName = (
  element: import('typescript').ImportSpecifier,
): { readonly exportName: string; readonly localName: string } => ({
  exportName: element.propertyName?.text ?? element.name.text,
  localName: element.name.text,
});

const resolveNamedImport = (
  importDecl: TSImportDeclaration,
  localName: string,
  ts: TypeScriptModule,
): { readonly exportName: string; readonly localName: string } | undefined => {
  const importClause = importDecl.importClause;
  if (!importClause || importClause.isTypeOnly) return undefined;
  const elements = getNamedImportElements(importClause.namedBindings, ts);

  const element = elements.find(
    (candidate) => !candidate.isTypeOnly && candidate.name.text === localName,
  );
  return element ? importSpecifierName(element) : undefined;
};

const findIdentifierImport = (
  sourceFile: TSSourceFile,
  localName: string,
  ts: TypeScriptModule,
): ResolvedImport | undefined => {
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const specifier = getImportModuleSpecifier(stmt, ts);
    if (!specifier) continue;
    const named = resolveNamedImport(stmt, localName, ts);
    if (!named) continue;
    return {
      modulePath: resolveRelativeImport(sourceFile, specifier),
      exportName: named.exportName,
      localName: named.localName,
    };
  }
  return undefined;
};

const hasExportModifier = (node: TSNode, ts: TypeScriptModule): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
    false);

const exportDeclarationNames = (stmt: TSStatement, ts: TypeScriptModule): readonly string[] => {
  if (!ts.isExportDeclaration(stmt)) return [];
  const clause = stmt.exportClause;
  if (!clause || !ts.isNamedExports(clause)) return [];
  return clause.elements.map((element) => element.name.text);
};

const declaresIdentifier = (
  stmt: TSStatement,
  identifierName: string,
  ts: TypeScriptModule,
): boolean => {
  if (ts.isVariableStatement(stmt)) {
    return stmt.declarationList.declarations.some(
      (decl) => ts.isIdentifier(decl.name) && decl.name.text === identifierName,
    );
  }
  if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name) {
    return stmt.name.text === identifierName;
  }
  return false;
};

const hasExportedLocalDeclaration = (
  sourceFile: TSSourceFile,
  identifierName: string,
  ts: TypeScriptModule,
): boolean => {
  for (const stmt of sourceFile.statements) {
    if (declaresIdentifier(stmt, identifierName, ts)) {
      if (hasExportModifier(stmt, ts)) return true;
    }
    if (exportDeclarationNames(stmt, ts).includes(identifierName)) return true;
  }
  return false;
};

const resolveSchemaIdentifier = (
  sourceFile: TSSourceFile,
  identifierName: string,
  ctx: RenderContext,
): string | undefined => {
  const imported = findIdentifierImport(sourceFile, identifierName, ctx.ts);
  if (imported) return ctx.imports.add(imported, ctx.out);

  if (hasExportedLocalDeclaration(sourceFile, identifierName, ctx.ts)) {
    return ctx.imports.add(
      {
        modulePath: sourceFile.fileName,
        exportName: identifierName,
        localName: identifierName,
      },
      ctx.out,
    );
  }

  return undefined;
};

const isLocalCoreInjectionModule = (sourceFile: TSSourceFile, moduleSpecifier: string): boolean => {
  if (!moduleSpecifier.startsWith('.')) return false;
  const resolved = normalizePath(resolve(dirname(sourceFile.fileName), moduleSpecifier));
  return (
    resolved.endsWith('/features/http/request/injection') ||
    resolved.endsWith('/features/http/request/injection/index') ||
    resolved.endsWith('/features/http/request/injection/body.lib') ||
    resolved.endsWith('/features/http/request/injection/validated.lib')
  );
};

const isAllowedHelperModule = (sourceFile: TSSourceFile, moduleSpecifier: string): boolean =>
  moduleSpecifier === '@zeltjs/core' || isLocalCoreInjectionModule(sourceFile, moduleSpecifier);

const helperKindFromExportName = (exportedName: string): HelperKind | undefined => {
  if (exportedName === 'body') return 'body';
  if (exportedName === 'validated') return 'validated';
  return undefined;
};

const getRuntimeNamedImportElements = (
  importClause: import('typescript').ImportClause | undefined,
  ts: TypeScriptModule,
): readonly import('typescript').ImportSpecifier[] => {
  if (!importClause || importClause.isTypeOnly) return [];
  return getNamedImportElements(importClause.namedBindings, ts);
};

const getHelperImportElements = (
  stmt: TSImportDeclaration,
  sourceFile: TSSourceFile,
  ctx: RenderContext,
): readonly import('typescript').ImportSpecifier[] => {
  const moduleSpecifier = getImportModuleSpecifier(stmt, ctx.ts);
  if (!moduleSpecifier) return [];
  if (!isAllowedHelperModule(sourceFile, moduleSpecifier)) return [];
  return getRuntimeNamedImportElements(stmt.importClause, ctx.ts);
};

const registerHelperImportElement = (
  element: import('typescript').ImportSpecifier,
  helpers: Map<string, HelperKind>,
): void => {
  if (element.isTypeOnly) return;
  const helper = helperKindFromExportName(element.propertyName?.text ?? element.name.text);
  if (helper) helpers.set(element.name.text, helper);
};

const collectHelpersFromImport = (
  stmt: TSImportDeclaration,
  sourceFile: TSSourceFile,
  ctx: RenderContext,
  helpers: Map<string, HelperKind>,
): void => {
  for (const element of getHelperImportElements(stmt, sourceFile, ctx)) {
    registerHelperImportElement(element, helpers);
  }
};

const collectImportedHelpers = (
  sourceFile: TSSourceFile,
  ctx: RenderContext,
): ReadonlyMap<string, HelperKind> => {
  const helpers = new Map<string, HelperKind>();
  for (const stmt of sourceFile.statements) {
    if (!ctx.ts.isImportDeclaration(stmt)) continue;
    collectHelpersFromImport(stmt, sourceFile, ctx, helpers);
  }
  return helpers;
};

const unsupportedParameterError = (
  controllerName: string,
  methodName: string | symbol,
  param: ParamInfo,
  reason: string,
): Error =>
  new Error(
    `Unsupported HTTP invocation parameter ${controllerName}.${String(methodName)}(${param.name}): ${reason}`,
  );

/** @throws {unsupportedParameterError} */
const renderBodyExpression = (
  call: TSCallExpression,
  controllerName: string,
  methodName: string | symbol,
  param: ParamInfo,
  ctx: RenderContext,
): InjectableExpression => {
  if (call.arguments.length > 1) {
    throw unsupportedParameterError(
      controllerName,
      methodName,
      param,
      'body() accepts only an optional body target',
    );
  }
  const target = resolveBodyTarget(call, controllerName, methodName, param, ctx);
  return { expression: `ctx.body('${target}')`, usesCtx: true, usesValidation: false };
};

/** @throws {unsupportedParameterError} */
const resolveBodyTarget = (
  call: TSCallExpression,
  controllerName: string,
  methodName: string | symbol,
  param: ParamInfo,
  ctx: RenderContext,
): 'json' | 'form' | 'text' => {
  const targetArg = call.arguments[0];
  const target = targetArg ? getStringLiteral(targetArg, ctx.ts) : 'json';
  if (!target) {
    throw unsupportedParameterError(
      controllerName,
      methodName,
      param,
      'body() target must be a string literal',
    );
  }
  if (target === 'json' || target === 'form' || target === 'text') return target;
  throw unsupportedParameterError(
    controllerName,
    methodName,
    param,
    `body() target must be "json", "form", or "text"`,
  );
};

/** @throws {unsupportedParameterError} */
const validateValidatedArity = (
  call: TSCallExpression,
  controllerName: string,
  methodName: string | symbol,
  param: ParamInfo,
): void => {
  if (call.arguments.length <= 2) return;
  throw unsupportedParameterError(
    controllerName,
    methodName,
    param,
    'validated() accepts only a schema and optional body target',
  );
};

/** @throws {unsupportedParameterError} */
const resolveValidatedSchemaName = (
  call: TSCallExpression,
  sourceFile: TSSourceFile,
  controllerName: string,
  methodName: string | symbol,
  param: ParamInfo,
  ctx: RenderContext,
): string => {
  const schemaArg = call.arguments[0];
  const schemaExpr = schemaArg ? unwrapExpression(schemaArg, ctx.ts) : undefined;
  if (!schemaExpr || !ctx.ts.isIdentifier(schemaExpr)) {
    throw unsupportedParameterError(
      controllerName,
      methodName,
      param,
      'validated() requires an imported or exported schema identifier',
    );
  }

  const schemaName = resolveSchemaIdentifier(sourceFile, schemaExpr.text, ctx);
  if (!schemaName) {
    throw unsupportedParameterError(
      controllerName,
      methodName,
      param,
      'validated() requires an imported or exported schema identifier',
    );
  }
  return schemaName;
};

/** @throws {unsupportedParameterError} */
const resolveValidatedTarget = (
  call: TSCallExpression,
  controllerName: string,
  methodName: string | symbol,
  param: ParamInfo,
  ctx: RenderContext,
): 'json' | 'form' => {
  const targetArg = call.arguments[1];
  const target = targetArg ? getStringLiteral(targetArg, ctx.ts) : 'json';
  if (!target) {
    throw unsupportedParameterError(
      controllerName,
      methodName,
      param,
      'validated() target must be a string literal',
    );
  }
  if (target === 'json' || target === 'form') return target;
  throw unsupportedParameterError(
    controllerName,
    methodName,
    param,
    `validated() target must be "json" or "form"`,
  );
};

/** @throws {unsupportedParameterError} */
const renderValidatedExpression = (
  call: TSCallExpression,
  sourceFile: TSSourceFile,
  controllerName: string,
  methodName: string | symbol,
  param: ParamInfo,
  ctx: RenderContext,
): InjectableExpression => {
  validateValidatedArity(call, controllerName, methodName, param);
  const schemaName = resolveValidatedSchemaName(
    call,
    sourceFile,
    controllerName,
    methodName,
    param,
    ctx,
  );
  const target = resolveValidatedTarget(call, controllerName, methodName, param, ctx);

  return {
    expression: `await validateBodyAsync(${schemaName}, '${target}')`,
    usesCtx: false,
    usesValidation: true,
  };
};

type AnalyzableCall = {
  readonly sourceFile: TSSourceFile;
  readonly call: TSCallExpression;
};

const findAnalyzableCall = (param: ParamInfo, ctx: RenderContext): AnalyzableCall | undefined => {
  const found = findParameterNode(param, ctx);
  const initializer = found?.parameter.initializer;
  if (!found || !initializer) return undefined;

  const expression = unwrapExpression(initializer, ctx.ts);
  if (!ctx.ts.isCallExpression(expression) || !ctx.ts.isIdentifier(expression.expression)) {
    return undefined;
  }
  return { sourceFile: found.sourceFile, call: expression };
};

/** @throws {unsupportedParameterError} */
const analyzeParameter = (
  controllerName: string,
  methodName: string | symbol,
  param: ParamInfo,
  ctx: RenderContext,
): InjectableExpression | undefined => {
  const found = findAnalyzableCall(param, ctx);
  if (!found || !ctx.ts.isIdentifier(found.call.expression)) return undefined;
  const helpers = collectImportedHelpers(found.sourceFile, ctx);
  const helper = helpers.get(found.call.expression.text);
  if (!helper) return undefined;

  if (helper === 'body') {
    return renderBodyExpression(found.call, controllerName, methodName, param, ctx);
  }
  return renderValidatedExpression(
    found.call,
    found.sourceFile,
    controllerName,
    methodName,
    param,
    ctx,
  );
};

/** @throws {Error | unsupportedParameterError} */
const buildHookSpec = (
  controller: ControllerClass,
  methodInfo: MethodInfo | undefined,
  routeKey: string,
  methodName: string | symbol,
  ctx: RenderContext,
): HookSpec | undefined => {
  if (!methodInfo) return undefined;

  const params: InjectableExpression[] = [];
  const unsupportedParams: ParamInfo[] = [];

  for (const param of methodInfo.params) {
    const rendered = analyzeParameter(controller.name, methodName, param, ctx);
    if (rendered) {
      params.push(rendered);
      continue;
    }
    unsupportedParams.push(param);
  }

  if (params.length === 0) return undefined;
  if (unsupportedParams.length > 0) {
    const first = unsupportedParams[0];
    if (!first) {
      throw new Error('Unexpected missing unsupported HTTP invocation parameter');
    }
    throw unsupportedParameterError(
      controller.name,
      methodName,
      first,
      'cannot safely generate a hook for this method because another parameter uses a supported HTTP injection helper',
    );
  }

  return { key: routeKey, params };
};

/** @throws {UnsupportedTypeScriptVersionError} */
const loadInspectModule = async (): Promise<InspectModule> => {
  const inspectModule = await import('@zeltjs/decorator-metadata/inspect');
  return {
    getOrCreateProgram: async (tsconfigPath) => inspectModule.getOrCreateProgram(tsconfigPath),
    getSourcePosition: (cls) => inspectModule.getSourcePosition(cls),
  };
};

/** @throws {Error} */
const unwrapInspectResult = <T>(result: InspectResult<T>, label: string): T => {
  if (result.isErr()) {
    const error = result.error ?? { code: 'UNKNOWN', message: 'Unknown inspect error' };
    throw new Error(`${label}: ${error.code}: ${error.message}`);
  }
  if (result.value === undefined) {
    throw new Error(`${label}: missing inspect result value`);
  }
  return result.value;
};

const renderHook = (hook: HookSpec): string => {
  const usesCtx = hook.params.some((param) => param.usesCtx);
  const args = usesCtx ? 'ctx' : '';
  const lines = hook.params.map((param) => `    ${param.expression},`);
  return [`  '${hook.key}': async (${args}) => [`, ...lines, '  ],'].join('\n');
};

const renderTypePrelude = (): string =>
  [
    'type HttpInvocationHookContext = {',
    "  readonly body: (type?: 'json' | 'form' | 'text') => unknown;",
    '};',
    '',
    'type HttpInvocationHook = (',
    '  ctx: HttpInvocationHookContext,',
    ') => readonly unknown[] | Promise<readonly unknown[]>;',
  ].join('\n');

const renderModule = (
  hooks: readonly HookSpec[],
  imports: ImportRegistry,
  coreImport: string,
  syntax: ModuleSyntax,
): string => {
  const needsValidation = hooks.some((hook) => hook.params.some((param) => param.usesValidation));
  const importLines = [
    ...(needsValidation ? [`import { validateBodyAsync } from '${coreImport}';`] : []),
    ...imports.render(),
  ];
  const typePrelude = syntax === 'typescript' ? [renderTypePrelude(), ''] : [];
  const exportEnd =
    syntax === 'typescript' ? '} satisfies Readonly<Record<string, HttpInvocationHook>>;' : '};';
  const parts = [
    ...importLines,
    ...(importLines.length > 0 ? [''] : []),
    ...typePrelude,
    'export const httpInvocationHooks = {',
    ...hooks.map(renderHook),
    exportEnd,
    '',
  ];
  return parts.join('\n');
};

/** @throws {Error | unsupportedParameterError | ZeltDecoratorUsageError | UnsupportedTypeScriptVersionError} */
export const renderHttpInvocationModule = async (
  options: RenderHttpInvocationModuleOptions,
): Promise<string> => {
  const tsconfigPath = resolve(options.tsconfig);
  const inspect = await loadInspectModule();
  const programResult = await inspect.getOrCreateProgram(tsconfigPath);
  const cachedProgram = unwrapInspectResult(programResult, 'Failed to load TypeScript program');

  const ctx: RenderContext = {
    program: cachedProgram.program,
    ts: cachedProgram.ts,
    out: options.out,
    coreImport: options.coreImport ?? '@zeltjs/core/http-invocation-runtime',
    imports: new ImportRegistry(
      options.moduleSpecifierMode ?? 'typescript',
      options.runtimeImportMap,
    ),
    inspect,
  };

  const routes = collectRoutes(options.controllers);
  const hooks: HookSpec[] = [];

  for (const controller of options.controllers) {
    const metadata = resolveControllerMetadata(controller, ctx);
    const controllerRoutes = routes.filter((route) => route.controllerClass === controller);
    for (const route of controllerRoutes) {
      const methodInfo = findMethodInfo(metadata, route.methodName);
      const hook = buildHookSpec(controller, methodInfo, route.hook, route.methodName, ctx);
      if (hook) hooks.push(hook);
    }
  }

  return renderModule(hooks, ctx.imports, ctx.coreImport, options.moduleSyntax ?? 'typescript');
};

/** @throws {Error | unsupportedParameterError | ZeltDecoratorUsageError | UnsupportedTypeScriptVersionError} */
export const generateHttpInvocationModule = async (
  options: GenerateHttpInvocationModuleOptions,
): Promise<GenerateHttpInvocationModuleResult> => {
  const outPath = resolve(options.out);
  const source = await renderHttpInvocationModule({ ...options, out: outPath });
  await mkdir(dirname(outPath), { recursive: true });
  return { changed: await writeIfChanged(outPath, source) };
};
