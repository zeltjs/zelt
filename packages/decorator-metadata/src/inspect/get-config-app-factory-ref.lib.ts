import { resolve } from 'node:path';

import type { ResultAsync } from 'neverthrow';
import { errAsync, okAsync } from 'neverthrow';

import { packageFromPath } from './class-source.lib';
import type { FunctionRef, InspectError } from './inspect.types';
import type { ProgramCacheError } from './program-cache.lib';
import { getOrCreateProgram } from './program-cache.lib';

const DEFAULT_TSCONFIG = './tsconfig.json';

type TypeScriptModule = typeof import('typescript');
type TSNode = import('typescript').Node;
type TSProgram = import('typescript').Program;
type TSTypeChecker = import('typescript').TypeChecker;
type TSExpression = import('typescript').Expression;

// オブジェクトリテラルの直下プロパティから `app` を探す(ネストしたオブジェクトは対象外。
// defineConfig の引数はフラットな設定オブジェクトのため)
const findAppPropertyInObject = (
  objectLiteral: import('typescript').ObjectLiteralExpression,
  ts: TypeScriptModule,
): TSExpression | undefined => {
  for (const prop of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    if (prop.name.text === 'app') return prop.initializer;
  }
  return undefined;
};

// export default defineConfig({ app: <expr> }) の <expr> を返す(呼び出し名は問わない。
// 唯一のオブジェクトリテラル引数の中から `app` プロパティを探すだけの構造的な走査)
const findAppPropertyExpr = (
  sourceFile: import('typescript').SourceFile,
  ts: TypeScriptModule,
): TSExpression | undefined => {
  for (const stmt of sourceFile.statements) {
    if (!ts.isExportAssignment(stmt) || stmt.isExportEquals) continue;
    const call = stmt.expression;
    if (!ts.isCallExpression(call)) continue;
    const objectArg = call.arguments[0];
    if (objectArg === undefined || !ts.isObjectLiteralExpression(objectArg)) continue;
    const appExpr = findAppPropertyInObject(objectArg, ts);
    if (appExpr !== undefined) return appExpr;
  }
  return undefined;
};

const functionRefOfFunctionDeclaration = (
  decl: import('typescript').Declaration,
  ts: TypeScriptModule,
): FunctionRef | undefined =>
  ts.isFunctionDeclaration(decl) && decl.name !== undefined
    ? { kind: 'function', filePath: decl.getSourceFile().fileName, name: decl.name.text }
    : undefined;

const functionRefOfMethodDeclaration = (
  decl: import('typescript').Declaration,
  ts: TypeScriptModule,
): FunctionRef | undefined =>
  ts.isMethodDeclaration(decl) &&
  ts.isIdentifier(decl.name) &&
  ts.isClassDeclaration(decl.parent) &&
  decl.parent.name
    ? {
        kind: 'method',
        filePath: decl.getSourceFile().fileName,
        owner: decl.parent.name.text,
        name: decl.name.text,
      }
    : undefined;

const functionRefOfVariableDeclaration = (
  decl: import('typescript').Declaration,
  ts: TypeScriptModule,
): FunctionRef | undefined =>
  ts.isVariableDeclaration(decl) &&
  ts.isIdentifier(decl.name) &&
  decl.initializer !== undefined &&
  (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
    ? { kind: 'function', filePath: decl.getSourceFile().fileName, name: decl.name.text }
    : undefined;

// get-call-sites.lib.ts の variableFunctionRefOf と同じ理由: `const foo = () => {}` への
// 呼び出しは checker.getResolvedSignature(...).declaration が VariableDeclaration ではなく
// ArrowFunction/FunctionExpression 自身を返す(実測で確認済み)。resolveCallExpressionRef が
// getResolvedSignature を優先するようになった(レビュー指摘3)ため、decl 自身がこの形に
// なるケースをここでも扱う必要がある
const functionRefOfArrowOrFunctionExpressionItself = (
  decl: import('typescript').Declaration,
  ts: TypeScriptModule,
): FunctionRef | undefined =>
  (ts.isArrowFunction(decl) || ts.isFunctionExpression(decl)) &&
  ts.isVariableDeclaration(decl.parent) &&
  ts.isIdentifier(decl.parent.name)
    ? { kind: 'function', filePath: decl.getSourceFile().fileName, name: decl.parent.name.text }
    : undefined;

const functionRefOfDeclaration = (
  decl: import('typescript').Declaration,
  ts: TypeScriptModule,
): FunctionRef | undefined =>
  functionRefOfFunctionDeclaration(decl, ts) ??
  functionRefOfMethodDeclaration(decl, ts) ??
  functionRefOfVariableDeclaration(decl, ts) ??
  functionRefOfArrowOrFunctionExpressionItself(decl, ts);

// 動的 `import(...)` 式の callee は Identifier/PropertyAccessExpression ではなく
// ImportKeyword トークンになる(isImportCall は typescript の公開型定義に存在しないため
// kind 判定で代用する)
const isDynamicImportCall = (
  call: import('typescript').CallExpression,
  ts: TypeScriptModule,
): boolean => call.expression.kind === ts.SyntaxKind.ImportKeyword;

// get-call-sites.lib.ts:resolveAliasedSymbol と同じ理由: import alias 越しの実体シンボルまで辿る
const resolveAliasedSymbol = (
  symbol: import('typescript').Symbol,
  checker: TSTypeChecker,
  ts: TypeScriptModule,
): import('typescript').Symbol =>
  (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;

const isDefaultLib = (decl: import('typescript').Declaration, program: TSProgram): boolean =>
  program.isSourceFileDefaultLibrary(decl.getSourceFile());

// checker.getResolvedSignature が失敗する呼び出し(一部の new 式等)へのフォールバック。
// シンボル解決 + alias 越しの実体解決(resolveAliasedSymbol)を1つにまとめる
const declarationViaSymbol = (
  nameNode: import('typescript').Identifier | import('typescript').PropertyAccessExpression['name'],
  checker: TSTypeChecker,
  ts: TypeScriptModule,
): import('typescript').Declaration | undefined => {
  const symbol = checker.getSymbolAtLocation(nameNode);
  if (symbol === undefined) return undefined;
  return resolveAliasedSymbol(symbol, checker, ts).getDeclarations()?.[0];
};

// レビュー指摘3: 「呼び出し先の callee 名からシンボルを直接引く」だけの旧実装は、静的
// `import { createApp } from './app-factory'; ... createApp()` を解決できなかった
// (getSymbolAtLocation が返す import alias シンボルの getDeclarations()[0] は
// ImportSpecifier ノードであり、functionRefOfDeclaration のどの形にも一致しないため)。
// get-call-sites.lib.ts の resolveCalleeDeclaration と同じ規則にする:
// checker.getResolvedSignature(オーバーロード選択・import 越しの実体解決を反映)を第一候補にし、
// 失敗時のみシンボル解決(+ alias 越しの実体解決)にフォールバックする
type CallTargetResolution =
  | { kind: 'internal'; readonly ref: FunctionRef }
  | { kind: 'excluded' } // TS 既定lib・node_modules(external)への呼び出し。root候補にしない
  | { kind: 'not-found' }; // 宣言が引けない、または internal の既知パターンに一致しない

const resolveCallExpressionRef = (
  call: import('typescript').CallExpression,
  program: TSProgram,
  checker: TSTypeChecker,
  ts: TypeScriptModule,
): CallTargetResolution => {
  const callee = call.expression;
  const nameNode = ts.isIdentifier(callee)
    ? callee
    : ts.isPropertyAccessExpression(callee)
      ? callee.name
      : undefined;
  if (nameNode === undefined) return { kind: 'not-found' };
  const sig = checker.getResolvedSignature(call);
  const decl = sig?.declaration ?? declarationViaSymbol(nameNode, checker, ts);
  if (decl === undefined) return { kind: 'not-found' };
  if (isDefaultLib(decl, program)) return { kind: 'excluded' };
  if (packageFromPath(decl.getSourceFile().fileName) !== undefined) return { kind: 'excluded' };
  const ref = functionRefOfDeclaration(decl, ts);
  return ref !== undefined ? { kind: 'internal', ref } : { kind: 'not-found' };
};

// app プロパティの関数本体を再帰的に走査し、最初に見つかった「internal な関数/メソッドへの
// 呼び出し」を FunctionRef にする。default-lib・external(node_modules)への呼び出しは
// 候補にせず(レビュー指摘3)、その呼び出し自身の引数の中を含めて探索を続ける
// (import(...) 自体(動的 import 式)は呼び出し先として解決しない。対象は m.createApp() 等、
// import の解決結果に対して行われる呼び出し)
const findFactoryRef = (
  root: TSNode,
  program: TSProgram,
  checker: TSTypeChecker,
  ts: TypeScriptModule,
): FunctionRef | undefined => {
  let found: FunctionRef | undefined;
  const visit = (node: TSNode): void => {
    if (found !== undefined) return;
    if (ts.isCallExpression(node) && !isDynamicImportCall(node, ts)) {
      const resolved = resolveCallExpressionRef(node, program, checker, ts);
      if (resolved.kind === 'internal') {
        found = resolved.ref;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
};

/** @throws {UnsupportedTypeScriptVersionError} */
export const getConfigAppFactoryRef = (
  configPath: string,
  options?: { readonly tsconfig?: string },
): ResultAsync<FunctionRef | undefined, InspectError | ProgramCacheError> => {
  const tsconfigPath = resolve(options?.tsconfig ?? DEFAULT_TSCONFIG);
  // ユーザーの tsconfig の include は zelt.config.ts(多くはプロジェクトルート直下で
  // src/ の外)を含む保証がない。studio がそのために tsconfig の変更をユーザーへ
  // 要求するのは筋が悪いため、include の結果に関わらず configPath を常に Program の
  // rootNames に含める
  return getOrCreateProgram(tsconfigPath, { extraRootFiles: [configPath] }).andThen(
    ({ program, checker, ts }) => {
      const sourceFile = program.getSourceFile(configPath);
      if (!sourceFile) {
        return errAsync<FunctionRef | undefined, InspectError>({
          code: 'SOURCE_NOT_FOUND',
          message: `Source file not found: ${configPath}`,
        });
      }
      const appExpr = findAppPropertyExpr(sourceFile, ts);
      if (appExpr === undefined) return okAsync(undefined);
      return okAsync(findFactoryRef(appExpr, program, checker, ts));
    },
  );
};
