import { resolve } from 'node:path';

import type { ResultAsync } from 'neverthrow';
import { errAsync, okAsync } from 'neverthrow';
import type { ImportRef } from './ast.lib';
import { buildImportMap } from './ast.lib';
import { classifyCallContext } from './call-context.lib';
import { normalizePackageName, packageFromPath } from './class-source.lib';
import {
  collectFunctionDeclarations,
  resolveDeclarationByOwnerAndName,
} from './function-collect.lib';
import type {
  CallSite,
  CallSiteTarget,
  FunctionRef,
  InspectError,
  UnresolvedReason,
} from './inspect.types';
import type { ProgramCacheError } from './program-cache.lib';
import { getOrCreateProgram } from './program-cache.lib';

const DEFAULT_TSCONFIG = './tsconfig.json';

type TypeScriptModule = typeof import('typescript');
type TSProgram = import('typescript').Program;
type TSTypeChecker = import('typescript').TypeChecker;
type TSSourceFile = import('typescript').SourceFile;
type TSNode = import('typescript').Node;
type TSCallLike =
  | import('typescript').CallExpression
  | import('typescript').NewExpression
  | import('typescript').TaggedTemplateExpression;
type TSDeclaration = import('typescript').Declaration;

// team-lead 決定(Task 10 remaining-diff cause 1・2): boundary は呼び出しごとに異なりうる
// (body 由来の呼び出しは body 自身、パラメータの default 値由来の呼び出しは関数宣言自身)ため
// Ctx から外し、classifyCallContext を呼ぶ側(toCallSite)に都度渡す
type Ctx = {
  readonly program: TSProgram;
  readonly checker: TSTypeChecker;
  readonly ts: TypeScriptModule;
  readonly sourceFile: TSSourceFile;
  readonly importMap: Map<string, ImportRef>;
};

// 単一リテラル型なので readonly を付けない(no-redundant-readonly-literal)
type Resolved = CallSiteTarget | { kind: 'excluded' }; // TS 既定libへの呼び出し。calls にも unresolvedCalls にも入れない

const declaringSourceFile = (decl: TSDeclaration): TSSourceFile => decl.getSourceFile();

const isDefaultLib = (decl: TSDeclaration, program: TSProgram): boolean =>
  program.isSourceFileDefaultLibrary(declaringSourceFile(decl));

const methodRefOf = (decl: TSDeclaration, ts: TypeScriptModule): FunctionRef | undefined => {
  if (
    !ts.isMethodDeclaration(decl) ||
    !ts.isIdentifier(decl.name) ||
    !ts.isClassDeclaration(decl.parent)
  ) {
    return undefined;
  }
  const owner = decl.parent.name?.text;
  return owner === undefined
    ? undefined
    : { kind: 'method', filePath: decl.getSourceFile().fileName, owner, name: decl.name.text };
};

const functionDeclarationRefOf = (
  decl: TSDeclaration,
  ts: TypeScriptModule,
): FunctionRef | undefined =>
  ts.isFunctionDeclaration(decl) && decl.name !== undefined
    ? { kind: 'function', filePath: decl.getSourceFile().fileName, name: decl.name.text }
    : undefined;

// `const foo = () => {}` への呼び出しは checker.getResolvedSignature(...).declaration が
// VariableDeclaration ではなく ArrowFunction/FunctionExpression 自身を返す(実測で確認済み。
// get-function-signature.lib.ts が FunctionRef から逆に node を引く向きのため気づかれなかった)。
// そのため decl.parent が VariableDeclaration である経路を見る
const variableFunctionRefOf = (
  decl: TSDeclaration,
  ts: TypeScriptModule,
): FunctionRef | undefined =>
  (ts.isArrowFunction(decl) || ts.isFunctionExpression(decl)) &&
  ts.isVariableDeclaration(decl.parent) &&
  ts.isIdentifier(decl.parent.name)
    ? { kind: 'function', filePath: decl.getSourceFile().fileName, name: decl.parent.name.text }
    : undefined;

// FunctionDeclaration/MethodDeclaration/module-scope const 束縛のいずれかを FunctionRef に変換する。
// collectFunctionDeclarations(function-collect.lib.ts)と同じ判定基準を、宣言ノード単体から逆引きする
const functionRefOfDeclaration = (
  decl: TSDeclaration,
  ts: TypeScriptModule,
): FunctionRef | undefined =>
  methodRefOf(decl, ts) ?? functionDeclarationRefOf(decl, ts) ?? variableFunctionRefOf(decl, ts);

// レビュー再指摘3: 明示 constructor を持つクラスは new X() の getResolvedSignature が
// ClassDeclaration ではなく ConstructorDeclaration を返す(実測で確認済み)。
// ConstructorDeclaration.parent は必ず ClassDeclaration/ClassExpression だが、
// 名前を持つのは ClassDeclaration のみのためそちらだけを扱う
const classDeclNameOf = (decl: TSDeclaration, ts: TypeScriptModule): string | undefined => {
  if (ts.isClassDeclaration(decl)) return decl.name?.text;
  if (ts.isConstructorDeclaration(decl) && ts.isClassDeclaration(decl.parent))
    return decl.parent.name?.text;
  return undefined;
};

// checker.getSymbolAtLocation の結果が import alias の場合、実体のシンボルまで辿る
// (get-dependencies.lib.ts:resolveClassDeclaration と同じ理由: 別名越しの宣言解決)
const resolveAliasedSymbol = (
  symbol: import('typescript').Symbol,
  checker: TSTypeChecker,
  ts: TypeScriptModule,
): import('typescript').Symbol =>
  (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;

// 規則(a): 現在ファイルの import から来たローカルなエイリアスなら、その module specifier を
// そのまま package にする。member は実際の export 名(ローカルの別名ではなく)を使う
const resolveViaImportMap = (
  identifierText: string,
  ctx: Ctx,
): { readonly package: string; readonly member: string } | undefined => {
  const ref = ctx.importMap.get(identifierText);
  if (ref === undefined) return undefined;
  return { package: normalizePackageName(ref.specifier), member: ref.exportName };
};

// 規則(b): 宣言ファイルの最寄りの package.json 名を使う
const resolveViaDeclaration = (
  decl: TSDeclaration,
  member: string,
): { readonly package: string; readonly member: string } | undefined => {
  const pkg = packageFromPath(declaringSourceFile(decl).fileName);
  if (pkg === undefined) return undefined;
  return { package: normalizePackageName(pkg.name), member };
};

// レビュー指摘1(critical): 「import map に載っているから external」という判定順序が誤りだった
// (相対 import された internal 関数が誤って external 扱いになるバグ、および property access
// 呼び出しが宣言ノード種別だけで internal 判定され node_modules のメソッドが internal
// 扱いになるバグ)。正しい順序は「まず宣言ファイルの実体の場所(program 内 or node_modules)で
// internal/external を分類し、external と判った場合にのみ規則(a)/(b)でパッケージ名を決める」。
// import map(規則a)は「命名」にのみ使い、internal/external の判定そのものには使わない。

// BindingElement/BindingPattern を分割代入の階層を遡って剥がし、実際の束縛の持ち主
// (Parameter か VariableDeclaration)を返す(`{ cb } = params` のようなネストした分割代入にも
// 対応するため BindingElement/ObjectBindingPattern/ArrayBindingPattern を交互に剥がす)
const rootBindingOwnerOf = (node: TSNode, ts: TypeScriptModule): TSNode => {
  let current = node;
  while (
    ts.isBindingElement(current) ||
    ts.isObjectBindingPattern(current) ||
    ts.isArrayBindingPattern(current)
  ) {
    current = current.parent;
  }
  return current;
};

// for-of/for-in の反復変数の VariableDeclaration かどうか(`for (const x of xs)` の x)。
// この形の宣言は initializer を持たない(値は反復元から来るため)ため、既存の
// 「initializer が CallExpression」条件では検出できない
const isForOfOrForInLoopVariable = (
  decl: import('typescript').VariableDeclaration,
  ts: TypeScriptModule,
): boolean => {
  const list = decl.parent;
  if (!ts.isVariableDeclarationList(list)) return false;
  const stmt = list.parent;
  return (ts.isForOfStatement(stmt) || ts.isForInStatement(stmt)) && stmt.initializer === list;
};

const isCallableType = (type: import('typescript').Type): boolean =>
  type.getCallSignatures().length > 0;

// `const fn = this.helper.ping; fn()` のような単純なメソッド参照代入は、この特殊ケースより
// 先に検出してしまうと checker.getResolvedSignature 経由で本来 internal 解決できるはずの
// 呼び出しを stored-function-reference に誤分類してしまう。そのため「initializer が
// CallExpression である VariableDeclaration」という既存の狭い条件はそのまま残し(レビュー
// 指摘の訂正コメント参照)、広げるのは「initializer を持ちようがない」束縛
// (for-of/for-in の反復変数、非パラメータの分割代入)だけに限定する
const isVariableDeclarationWithCallInitializer = (
  decl: import('typescript').Declaration,
  ts: TypeScriptModule,
): boolean =>
  ts.isVariableDeclaration(decl) &&
  decl.initializer !== undefined &&
  ts.isCallExpression(decl.initializer);

// team-lead 決定(Task 10 remaining-diff cause 6): 'stored-function-reference' を、
// initializer を持ちようがない呼び出し可能な型のローカル束縛(for-of/for-in の反復変数・
// 非パラメータの分割代入)にも広げる。以前は見落としていたため、配列プロパティを for-of で
// 反復する束縛(`for (const fn of this.fns) fn()`。ec-backend の OrderHandlers.shutdown の
// 実例)が symbol-unresolved に落ちていた
const isNonParameterBindingWithCallableType = (
  decl: import('typescript').Declaration,
  ctx: Ctx,
): boolean => {
  const isForOfVar = ctx.ts.isVariableDeclaration(decl) && isForOfOrForInLoopVariable(decl, ctx.ts);
  const isNonParamBindingElement =
    ctx.ts.isBindingElement(decl) && ctx.ts.isVariableDeclaration(rootBindingOwnerOf(decl, ctx.ts));
  if (!isForOfVar && !isNonParamBindingElement) return false;
  return isCallableType(ctx.checker.getTypeAtLocation(decl));
};

// パラメータの分割代入由来の BindingElement は 'parameter-callback' のまま
// (呼び出し元の値が「パラメータとして渡された関数」であることに変わりはないため)
const bareIdentifierSpecialCase = (
  identifier: import('typescript').Identifier,
  ctx: Ctx,
): UnresolvedReason | undefined => {
  const symbol = ctx.checker.getSymbolAtLocation(identifier);
  const decl = symbol?.getDeclarations()?.[0];
  if (decl === undefined) return undefined;
  const isParamBindingElement =
    ctx.ts.isBindingElement(decl) && ctx.ts.isParameter(rootBindingOwnerOf(decl, ctx.ts));
  if (ctx.ts.isParameter(decl) || isParamBindingElement) return 'parameter-callback';
  if (isVariableDeclarationWithCallInitializer(decl, ctx.ts)) return 'stored-function-reference';
  if (isNonParameterBindingWithCallableType(decl, ctx)) return 'stored-function-reference';
  return undefined;
};

// 呼び先の宣言を得るための「名前ノード」。シンボル解決のフォールバックにのみ使う
// (第一候補は getResolvedSignature。レビュー指摘1: オーバーロード選択を反映するため)
type CalleeNameNode =
  | { kind: 'identifier'; readonly node: import('typescript').Identifier }
  | { kind: 'property'; readonly node: import('typescript').PropertyAccessExpression }
  | { kind: 'element' }
  | undefined;

const calleeNameNodeOf = (node: TSCallLike, ts: TypeScriptModule): CalleeNameNode => {
  if (ts.isNewExpression(node)) {
    return ts.isIdentifier(node.expression)
      ? { kind: 'identifier', node: node.expression }
      : undefined;
  }
  if (ts.isTaggedTemplateExpression(node)) {
    if (ts.isIdentifier(node.tag)) return { kind: 'identifier', node: node.tag };
    if (ts.isPropertyAccessExpression(node.tag)) return { kind: 'property', node: node.tag };
    return undefined;
  }
  const callee = node.expression; // CallExpression
  if (ts.isElementAccessExpression(callee)) return { kind: 'element' };
  if (ts.isIdentifier(callee)) return { kind: 'identifier', node: callee };
  if (ts.isPropertyAccessExpression(callee)) return { kind: 'property', node: callee };
  return undefined;
};

// checker.getResolvedSignature を第一候補にする(オーバーロードのうち実際に選択された
// 宣言を反映する)。シグネチャが取れない呼び出し(new 等の一部ケースを含む)はシンボル解決に
// フォールバックする
const resolveCalleeDeclaration = (node: TSCallLike, ctx: Ctx): TSDeclaration | undefined => {
  const sig = ctx.checker.getResolvedSignature(node);
  if (sig?.declaration !== undefined) return sig.declaration;
  const nameNode = calleeNameNodeOf(node, ctx.ts);
  if (nameNode === undefined || nameNode.kind === 'element') return undefined;
  const symbol = ctx.checker.getSymbolAtLocation(nameNode.node);
  if (symbol === undefined) return undefined;
  return resolveAliasedSymbol(symbol, ctx.checker, ctx.ts).getDeclarations()?.[0];
};

// プロパティアクセス呼び出しの「型名」: レシーバの見かけの型ではなく、そのプロパティを
// 実際に宣言しているクラス/interfaceの名前(例: RequestAccessorBase.body。継承元まで
// 遡る必要があるため typeToString には頼れない)
const declaringContainerName = (
  decl: TSDeclaration,
  receiverType: import('typescript').Type,
  checker: TSTypeChecker,
  ts: TypeScriptModule,
): string => {
  const parent = decl.parent;
  if (
    (ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent)) &&
    parent.name !== undefined
  ) {
    return parent.name.text;
  }
  // team-lead 決定(Task 10 remaining-diff cause 3): `type X = { method(): T }` のような
  // 型リテラルのメンバーは、その型リテラル自身を指す type alias の宣言名を使う(型引数は
  // 含めない)。@zeltjs/core の `RequestAccessor<TBody> = RequestAccessorBase<TBody>` は
  // 公開 alias が非公開の型リテラル alias `RequestAccessorBase` を指すだけなので、
  // レシーバの見かけの型(`RequestAccessor<unknown>` のような、alias 越しに具体化された
  // 型引数付きの表示)ではなく、メンバーが実際に書かれている `RequestAccessorBase` を返す
  if (ts.isTypeLiteralNode(parent) && ts.isTypeAliasDeclaration(parent.parent)) {
    return parent.parent.name.text;
  }
  // 名前を持つコンテナが無い場合(無名の inline object 型など)は受信側の型表示に
  // フォールバックする(「最悪でも情報が消えない」ための次善策。既存コードの debt コメントと
  // 同じ考え方)
  return checker.typeToString(receiverType);
};

// external と判明した場合の package/member 決定。nameNode が identifier(裸呼び出し/new/
// タグ付きテンプレート)なら規則(a)(import map)を先に試し、無ければ規則(b)。
// nameNode が property(プロパティアクセス呼び出し)なら規則(b)のみ(プロパティ名自体は
// import されたローカル束縛ではないため規則(a)は成立しない)
const externalPackageAndMember = (
  decl: TSDeclaration,
  nameNode: CalleeNameNode,
  ctx: Ctx,
  receiverType: import('typescript').Type | undefined,
): { readonly package: string; readonly member: string } | undefined => {
  if (nameNode?.kind === 'identifier') {
    const viaImport = resolveViaImportMap(nameNode.node.text, ctx);
    if (viaImport !== undefined) return viaImport;
    return resolveViaDeclaration(decl, nameNode.node.text);
  }
  if (nameNode?.kind === 'property' && receiverType !== undefined) {
    const containerName = declaringContainerName(decl, receiverType, ctx.checker, ctx.ts);
    return resolveViaDeclaration(decl, `${containerName}.${nameNode.node.name.text}`);
  }
  return undefined;
};

const unresolvedSymbol = (node: TSCallLike): Resolved => ({
  kind: 'unresolved',
  expression: node.getText(),
  reason: 'symbol-unresolved',
});

// 特殊ケース(パラメータ由来コールバック/保存済み関数参照)は裸呼び出しのみに適用し、
// 宣言解決より先に判定する(5f)
const bareSpecialCaseReason = (
  node: TSCallLike,
  nameNode: CalleeNameNode,
  ctx: Ctx,
): UnresolvedReason | undefined => {
  if (ctx.ts.isNewExpression(node) || ctx.ts.isTaggedTemplateExpression(node)) return undefined;
  if (nameNode?.kind !== 'identifier') return undefined;
  return bareIdentifierSpecialCase(nameNode.node, ctx);
};

// レビュー指摘4: ネストした(トップレベルでない)`function local() {}` 宣言への呼び出しは、
// functionRefOfDeclaration が「モジュールスコープの関数」と区別せず同じ FunctionRef
// {kind:'function', name}(owner無し)を作ってしまう。しかし collectFunctionDeclarations
// (function-collect.lib.ts の SSOT)は sourceFile.statements 直下しか列挙しないため、
// この ref に対応する宣言は存在せず、呼び出し先で DECLARATION_NOT_FOUND になっていた
// (ec-backend 相当の実例なし・ユニットテストで再現)。ネストした関数自身の本体の呼び出しは
// 既に囲む関数の CallSite 列挙に含まれている(collectCallLikeNodes が関数境界で止まらず
// 全ノードを辿るため)ため、この呼び出し自体だけを記録から外せばよい(TypeScript 既定libへの
// 呼び出しと同じ 'excluded' 扱い。calls にも unresolvedCalls にも入れない)
const isNestedFunctionDeclaration = (decl: TSDeclaration, ts: TypeScriptModule): boolean =>
  ts.isFunctionDeclaration(decl) && !ts.isSourceFile(decl.parent);

const resolveInternalTarget = (node: TSCallLike, decl: TSDeclaration, ctx: Ctx): Resolved => {
  if (ctx.ts.isNewExpression(node)) {
    const className = classDeclNameOf(decl, ctx.ts);
    return className !== undefined
      ? { kind: 'internal-class', filePath: decl.getSourceFile().fileName, name: className }
      : unresolvedSymbol(node);
  }
  if (isNestedFunctionDeclaration(decl, ctx.ts)) return { kind: 'excluded' };
  const ref = functionRefOfDeclaration(decl, ctx.ts);
  return ref !== undefined ? { kind: 'internal', ref } : unresolvedSymbol(node);
};

const resolveExternalTarget = (
  node: TSCallLike,
  decl: TSDeclaration,
  nameNode: CalleeNameNode,
  ctx: Ctx,
): Resolved => {
  const receiverType =
    nameNode?.kind === 'property'
      ? ctx.checker.getTypeAtLocation(nameNode.node.expression)
      : undefined;
  const external = externalPackageAndMember(decl, nameNode, ctx, receiverType);
  return external !== undefined
    ? { kind: 'external', package: external.package, member: external.member }
    : unresolvedSymbol(node);
};

const resolveCallLike = (node: TSCallLike, ctx: Ctx): Resolved => {
  const nameNode = calleeNameNodeOf(node, ctx.ts);
  if (nameNode?.kind === 'element') {
    return { kind: 'unresolved', expression: node.getText(), reason: 'dynamic-property-access' };
  }
  const special = bareSpecialCaseReason(node, nameNode, ctx);
  if (special !== undefined)
    return { kind: 'unresolved', expression: node.getText(), reason: special };

  const decl = resolveCalleeDeclaration(node, ctx);
  if (decl === undefined) return unresolvedSymbol(node);
  if (isDefaultLib(decl, ctx.program)) return { kind: 'excluded' };

  // レビュー指摘1の核心: internal/external を「宣言ファイルの実際の場所」で先に分類する
  const isExternal = packageFromPath(declaringSourceFile(decl).fileName) !== undefined;
  return isExternal
    ? resolveExternalTarget(node, decl, nameNode, ctx)
    : resolveInternalTarget(node, decl, ctx);
};

// レシーバ式自体が CallExpression である呼び出し(メソッドチェーンの中間)は記録しない。
// チェーンの引数(eq(...) 等)は forEachChild が別途たどるため、ここでは対象呼び出し自身のみ判定する
const isChainContinuation = (
  node: import('typescript').CallExpression,
  ts: TypeScriptModule,
): boolean =>
  ts.isPropertyAccessExpression(node.expression) && ts.isCallExpression(node.expression.expression);

// no-type-predicate: `node is TSCallLike` は書かず、各 ts.isXxx (TypeScript 本体の型述語)の
// 分岐ごとに narrow された node をそのまま push する。root 自身が呼び出し式である場合も
// 対象に含める(パラメータの default 値 `req = request(Schema)` はそれ自体が root として
// 渡ってくる CallExpression になりうるため。Block 本体は Call/New/TaggedTemplate になり
// 得ないため root 自身のチェックは無害な no-op)
const collectCallLikeNodes = (root: TSNode, ts: TypeScriptModule): TSCallLike[] => {
  const found: TSCallLike[] = [];
  const visit = (node: TSNode): void => {
    if (ts.isCallExpression(node)) {
      if (!isChainContinuation(node, ts)) found.push(node);
    } else if (ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
};

const firstArgLiteralOf = (node: TSCallLike, ts: TypeScriptModule): string | undefined => {
  if (ts.isTaggedTemplateExpression(node)) return undefined; // タグ付きテンプレートに通常引数は無い
  const arg = node.arguments?.[0];
  return arg !== undefined && ts.isStringLiteralLike(arg) ? arg.text : undefined;
};

const isAwaited = (node: TSCallLike, ts: TypeScriptModule): boolean =>
  ts.isAwaitExpression(node.parent);

// レビュー指摘12: column は build-graph.lib.ts の辺重複排除キーにのみ使うため、
// line と同じ getLineAndCharacterOfPosition の1回の呼び出しから両方取り出す
const lineAndColumnOf = (
  sourceFile: TSSourceFile,
  pos: number,
): { readonly line: number; readonly column: number } => {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: line + 1, column: character + 1 };
};

// team-lead 決定(Task 10 remaining-diff cause 4): line/column は callExpr.getStart() ではなく
// 呼び出し先の「名前トークン」の位置を使う(プロパティアクセス呼び出しはプロパティ名
// identifier、裸呼び出しは identifier 自身、`new X()` はクラス名 identifier、タグ付き
// テンプレートはタグ)。複数行にまたがるメソッドチェーン `this.drizzle.db\n  .select()` で
// `.select` 自身の行を指すようにするため(callExpr.getStart() だとレシーバ式の先頭行
// `this.drizzle.db` になってしまう。ec-backend の実例で判明)
const calleeNameTokenStartOf = (node: TSCallLike, ts: TypeScriptModule): number => {
  if (ts.isNewExpression(node)) {
    return ts.isIdentifier(node.expression) ? node.expression.getStart() : node.getStart();
  }
  if (ts.isTaggedTemplateExpression(node)) return node.tag.getStart();
  const callee = node.expression;
  return ts.isPropertyAccessExpression(callee) ? callee.name.getStart() : callee.getStart();
};

const toCallSite = (
  node: TSCallLike,
  resolved: CallSiteTarget,
  ctx: Ctx,
  boundary: TSNode,
): CallSite => {
  const { line, column } = lineAndColumnOf(ctx.sourceFile, calleeNameTokenStartOf(node, ctx.ts));
  const site: CallSite = {
    line,
    column,
    awaited: isAwaited(node, ctx.ts),
    context: classifyCallContext(node, ctx.ts, boundary),
    target: resolved,
  };
  const firstArgLiteral = firstArgLiteralOf(node, ctx.ts);
  return firstArgLiteral === undefined ? site : { ...site, firstArgLiteral };
};

const ownerOf = (ref: FunctionRef): string | undefined =>
  ref.kind === 'method' ? ref.owner : undefined;

// root(body、またはパラメータの default 値)配下の呼び出しを解決して CallSite にする。
// boundary は呼び出し元(getCallSites)が渡す(root 由来によって正しい boundary が異なるため。
// 上の呼び出し元コメント参照)
const sitesIn = (root: TSNode, boundary: TSNode, ctx: Ctx): readonly CallSite[] => {
  const sites: CallSite[] = [];
  for (const node of collectCallLikeNodes(root, ctx.ts)) {
    const resolved = resolveCallLike(node, ctx);
    if (resolved.kind === 'excluded') continue;
    sites.push(toCallSite(node, resolved, ctx, boundary));
  }
  return sites;
};

/** @throws {UnsupportedTypeScriptVersionError} */
export const getCallSites = (
  ref: FunctionRef,
  options?: { readonly tsconfig?: string },
): ResultAsync<readonly CallSite[], InspectError | ProgramCacheError> => {
  const tsconfigPath = resolve(options?.tsconfig ?? DEFAULT_TSCONFIG);
  return getOrCreateProgram(tsconfigPath).andThen(({ program, checker, ts }) => {
    const sourceFile = program.getSourceFile(ref.filePath);
    if (!sourceFile) {
      return errAsync<readonly CallSite[], InspectError>({
        code: 'SOURCE_NOT_FOUND',
        message: `Source file not found: ${ref.filePath}`,
      });
    }
    const owner = ownerOf(ref);
    const declarations = collectFunctionDeclarations(sourceFile, checker, ts);
    // owner 自体が無い場合の EXPORT_NOT_FOUND、該当なしの SIGNATURE_NOT_FOUND、get/set
    // 同名共存等で複数一致する場合の AMBIGUOUS_MEMBER(レビュー指摘4・5)は getFunctionSignature
    // と共有のロジック(function-collect.lib.ts)にまとめてある
    const resolved = resolveDeclarationByOwnerAndName(declarations, owner, ref.name, ref.filePath);
    if (resolved.kind === 'error')
      return errAsync<readonly CallSite[], InspectError>(resolved.error);
    const collected = resolved.fn;
    const ctx: Ctx = {
      program,
      checker,
      ts,
      sourceFile,
      importMap: buildImportMap(sourceFile, ts),
    };
    const body = collected.node.body;
    if (body === undefined) return okAsync([]); // 抽象/オーバーロード宣言など本体を持たない場合

    // team-lead 決定(Task 10 remaining-diff cause 1): body 由来の呼び出しの boundary は body
    // 自身にする(collected.node ではない)。body の親は collected.node(関数宣言自身)であり、
    // それを boundary にすると「current === boundary に達する前に、body の親である
    // collected.node が ArrowFunction/FunctionExpression かつ body がその .body であること」
    // に classifyCallContext のルール5がマッチしてしまい、モジュールスコープの
    // `const f = () => { g() }` のような関数自身の本体トップレベルの呼び出しが誤って
    // 'callback' になる(ec-backend の requireUser/hashPassword で実例確認済み)。
    // body を boundary にすれば、そこに到達した時点でループが止まりルール5を評価しないため
    // 正しく 'plain' になる
    const bodySites = sitesIn(body, body, ctx);
    // team-lead 決定(Task 10 remaining-diff cause 2): パラメータの default 値
    // (`register(req = request(Schema))`)は body の外にあるため、body だけを走査する
    // 上の経路では発見されない。ここで別途パラメータの initializer を走査する。
    // これらの呼び出しの boundary は collected.node(関数宣言自身)にする — 呼び出しの
    // 親は Parameter であり ArrowFunction/FunctionExpression の `.body` ではないため、
    // ルール5には引っかからず正しく 'plain' になる(default 値の中に更にコールバックが
    // 書かれていれば、そのネストしたコールバックの境界はそちらの ArrowFunction が
    // 引き続き検出する。境界に達するまでの経路の問題であり body 側の修正と対称)
    const paramInitializerSites = collected.node.parameters
      .flatMap((p) => (p.initializer !== undefined ? [p.initializer] : []))
      .flatMap((init) => sitesIn(init, collected.node, ctx));
    return okAsync([...bodySites, ...paramInitializerSites]);
  });
};
