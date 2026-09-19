import type { Position } from './position.lib';

export type { Position };

export type PrimitiveType = 'string' | 'number' | 'boolean' | 'null' | 'undefined';

export type TypeInfo =
  | { kind: 'primitive'; readonly type: PrimitiveType }
  | { kind: 'literal'; readonly value: string | number | boolean }
  | {
      kind: 'named';
      readonly name: string;
      readonly module: string;
      readonly isExported: boolean;
    }
  | { kind: 'array'; readonly items: TypeInfo }
  | { kind: 'object'; readonly properties: readonly TypedPropertyInfo[] }
  | { kind: 'union'; readonly types: readonly TypeInfo[] }
  | { kind: 'promise'; readonly inner: TypeInfo }
  | { kind: 'unknown' }
  | { kind: 'ref'; readonly name: string };

export type TypedPropertyInfo = {
  readonly name: string;
  readonly type: TypeInfo;
  readonly optional: boolean;
};

export type ParamInfo = {
  readonly name: string;
  readonly type: TypeInfo;
  readonly pos: Position | undefined;
};

export type MethodInfo = {
  readonly name: string | symbol;
  readonly pos: Position | undefined;
  readonly props: readonly object[];
  readonly params: readonly ParamInfo[];
  readonly returnType: TypeInfo;
};

export type PropertyInfo = {
  readonly name: string | symbol;
  readonly pos: Position | undefined;
  readonly props: readonly object[];
  readonly type: TypeInfo;
  readonly optional: boolean;
};

export type ClassMetadata = {
  readonly name: string;
  readonly pos: Position | undefined;
  readonly props: readonly object[];
  readonly methods: readonly MethodInfo[];
  readonly properties: readonly PropertyInfo[];
};

export type InspectErrorCode =
  | 'NO_METADATA'
  | 'SOURCE_NOT_FOUND'
  | 'POSITION_INVALID'
  | 'TSCONFIG_ERROR'
  | 'EXPORT_NOT_FOUND'
  | 'MODULE_LOAD_FAILED'
  | 'SIGNATURE_NOT_FOUND'
  | 'DECLARATION_NOT_FOUND'
  // owner+name の組で解決しようとした宣言が2件以上あった(例: get/set accessor が同名で
  // 共存する。design memo 12 の未対応ケース)。黙って先勝ちで選ばず fail する(レビュー指摘5)
  | 'AMBIGUOUS_MEMBER';

/**
 * 実クラスと静的なソース参照を相互変換するための識別子。
 * filePath はそのまま dynamic import できる解決済みパスであること
 * (= ClassSource は「import 可能」を不変条件とする)。
 */
export type ClassSource = {
  readonly filePath: string;
  readonly exportName: string;
};

/**
 * getDependencySources の 1 依存分の結果。
 * kind: 'class' の source は「実クラス経由で正準化済み」の ClassSource
 * (同一クラスなら root 由来でも依存由来でも必ず同じ値になる)。
 */
export type DependencySource =
  | {
      kind: 'class';
      readonly localName: string;
      readonly source: ClassSource;
      readonly line: number;
    }
  | { kind: 'unresolved'; readonly localName: string; readonly reason: string };

export type InspectError = {
  readonly code: InspectErrorCode;
  readonly message: string;
};

export type ExpandStrategy = 'exported-only' | 'all-named' | 'always';

export type InspectOptions = {
  readonly tsconfig?: string;
  readonly expandStrategy?: ExpandStrategy;
};

// --- getDependencies types ---

export type GetDependenciesOptions = {
  readonly tsconfig?: string;
};

export type DependencyInfo = {
  readonly className: string;
  readonly sourceFile: string;
  readonly moduleSpecifier: string;
  readonly hasConfigDecorator: boolean;
  readonly decorators: readonly string[];
};

// --- getFunctionSignature types ---

/**
 * 関数/メソッド1件分の契約。型は checker.typeToString の文字列表現
 * (構造 diff・AI 可読の用途では文字列で足りる。Promise は unwrap しない)。
 */
export type FunctionContract = {
  readonly params: readonly { readonly name: string; readonly type: string }[];
  readonly returnType: string;
};

// --- function/call primitives (v3 studio wiring extraction) ---

export type FunctionRef =
  | { kind: 'function'; readonly filePath: string; readonly name: string }
  | { kind: 'method'; readonly filePath: string; readonly owner: string; readonly name: string };

// decorator 1件分。line は decorator 式の開始行(1-based)。args は識別子として渡され、
// かつ TypeChecker でクラス宣言に解決できた引数の ClassSource のみ(文字列リテラル・
// 非クラス識別子は含まない)。@UseMiddleware(X) の行を呼び出し側(build-graph.lib.ts)が
// X の ClassSource で突き合わせるために必要(team-lead 決定。レビュー指摘8: 文字列比較だと
// import 別名で一致しなくなるため ClassSource で比較する)
export type DecoratorInfo = {
  readonly name: string;
  readonly line: number;
  readonly args: readonly ClassSource[];
};

export type FunctionDeclarationInfo = {
  readonly ref: FunctionRef;
  // メソッド自身の decorator のみ(クラス側は呼び出し側の責務)。
  // モジュール関数は常に []( TS の構文上、関数宣言そのものに decorator は付けられない)
  readonly decorators: readonly DecoratorInfo[];
  readonly visibility: 'public' | 'private';
  readonly loc: { readonly start: number; readonly end: number };
};

// --- getCallSites types ---

export type CallContext = 'try' | 'catch' | 'finally' | 'branch' | 'loop' | 'callback' | 'plain';

export type UnresolvedReason =
  // 呼び出し先がこの関数のパラメータで、関数型(コールバック)として渡された値
  | 'parameter-callback'
  // 呼び出し先が、過去に他の呼び出しの戻り値として保存されたローカル変数
  | 'stored-function-reference'
  // 呼び出し先が計算プロパティアクセス(obj[expr]())経由
  | 'dynamic-property-access'
  // 上記以外で TypeChecker がシンボルを解決できなかった場合の catch-all
  | 'symbol-unresolved';

export type CallSiteTarget =
  | { kind: 'internal'; readonly ref: FunctionRef }
  // new X() で X が解析対象プログラム内のクラスの場合。FunctionRef は関数/メソッドの
  // みを表すため、クラス自体を指す専用の kind を設ける(spec 5(c)、設計判断メモ2)
  | { kind: 'internal-class'; readonly filePath: string; readonly name: string }
  | { kind: 'external'; readonly package: string; readonly member: string }
  | { kind: 'unresolved'; readonly expression: string; readonly reason: UnresolvedReason };

export type CallSite = {
  readonly line: number;
  // call 式の開始位置の列(1-based)。JSON出力(CallsEdge)には出さず、
  // build-graph.lib.ts の辺重複排除キー(同一行・別列の呼び出しを別辺として扱う)にのみ使う
  readonly column: number;
  readonly awaited: boolean;
  readonly context: CallContext;
  readonly target: CallSiteTarget;
  // 第1引数が文字列リテラルの場合のみ。event エッジの相関にのみ studio 側で使う
  readonly firstArgLiteral?: string;
};

// --- getClassDeclarations types ---

export type ClassDeclarationInfo = {
  // 宣言名(AST上の識別子名)。ClassNode の id/name は常にこれを使う(exportName ではない)
  readonly name: string;
  // export 別名がある場合のみ設定(default export は 'default'、`export { A as B }` は 'B')。
  // 通常の named export(exportName === name)では省略する。レビュー指摘6
  readonly exportName?: string;
  readonly loc: { readonly start: number; readonly end: number };
  // クラス自身の decorator(宣言順)。DecoratorInfo は Task 1 で定義済み
  readonly decorators: readonly DecoratorInfo[];
  // export 修飾子の有無(`export { X }` 別文での再export は対象外。実例が無いため未対応)
  readonly exported: boolean;
};
