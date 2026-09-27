// getCallSites (呼び出し先解決) テスト用
import { randomBytes } from 'node:crypto';

import { Ok, ok } from 'neverthrow';

import { importedHelper as viaBarrel } from './barrel';
import { importedHelper } from './imported-helper';

class Helper {
  ping(): string {
    return 'pong';
  }

  static create(): Helper {
    return new Helper();
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

// レビュー再指摘3: 明示 constructor を持つクラスは `new X()` の
// `checker.getResolvedSignature(...)?.declaration` が ClassDeclaration ではなく
// ConstructorDeclaration を返す(実測で確認済み。Helper のような暗黙 constructor の
// クラスでは代わりにシンボル解決フォールバックが ClassDeclaration を返すため今まで
// 気づかれなかった)
class HelperWithCtor {
  constructor(private readonly label: string) {}

  describe(): string {
    return this.label;
  }
}

const bareModuleCallee = (): void => {
  requireUser();
};

export const requireUser = (): string => 'user';

// Task 5 追加(レビュー指摘2): タグ付きテンプレート式も通常の呼び出しと同様に解決できることの確認用
const tag = (strings: TemplateStringsArray, ...values: readonly unknown[]): string =>
  strings.reduce((acc, s, i) => `${acc}${s}${values[i] ?? ''}`, '');

// Task 5 追加(レビュー指摘2): メソッドチェーンの引数として渡された呼び出し(baz())が、
// チェーンの中間呼び出し(bar())とは独立して記録されることの確認用
const foo = (): { readonly bar: (n: number) => string } => ({ bar: (n: number) => String(n) });
const baz = (): number => 42;

// Task 5 追加(レビュー指摘2): super.m() がサブクラス自身ではなく親クラスの宣言に解決されることの確認用
class BaseGreeter {
  greet(): string {
    return 'base';
  }
}

export class DerivedGreeter extends BaseGreeter {
  override greet(): string {
    return super.greet();
  }
}

export class Caller {
  private readonly helper = new Helper();
  private readonly unsubscribes: Array<() => void> = [];

  callBareInternal(): void {
    requireUser();
  }

  callMethodOnSelf(): void {
    this.otherMethod();
  }

  otherMethod(): void {
    // no-op
  }

  callPropertyAccessInternal(): string {
    return this.helper.ping();
  }

  callExternalBare(): Buffer {
    return randomBytes(16);
  }

  // レビュー再指摘1: isChainContinuation(レシーバ式自体が CallExpression である呼び出しは
  // メソッドチェーンの中間として記録しない、spec 5(c))により `.toString('hex')` はここでは
  // 記録されない。`randomBytes(16)` 自体の1件のみが external になることを確認する用途に絞る
  callExternalPropertyAccess(): Buffer {
    return randomBytes(16);
  }

  // isChainContinuation はレシーバ「式」が CallExpression の場合のみ中間呼び出しとして
  // 除外する。レシーバをローカル変数へ代入すれば独立した呼び出しとして記録される
  // (ec-backend の実例と同じ形: 一度変数に受けてからプロパティアクセス呼び出しをする)
  callExternalPropertyAccessOnVariable(): string {
    const derived = randomBytes(16);
    return derived.toString('hex');
  }

  // deviation memo: brief 記載は `new HTTPException(400, { message: 'bad' })`(hono) だが
  // hono は @zeltjs/decorator-metadata の依存に含まれず pnpm の isolated node_modules では
  // 解決できない(Global Constraints: 新規パッケージ依存の追加は無い)。同じ「node_modules 内の
  // 明示 constructor を持つ実在クラスへの new」という条件を、既存devDependency の neverthrow の
  // Ok クラスで代替する
  callExternalNew(): Ok<string, never> {
    return new Ok('bad');
  }

  // レビュー指摘1のリグレッションガード: neverthrow の Ok クラスの isOk はクラス宣言の
  // 実メソッド(MethodDeclaration ノード)であり、宣言ファイルの場所を見ずにノード種別だけで
  // 判定すると internal と誤判定されるバグがあった(eventBus.emit / JwtService.sign と同種)。
  // レシーバをローカル変数に代入し、メソッドチェーンの中間呼び出し(記録されない)にならない
  // ようにする(result.isOk() のレシーバは Identifier であり CallExpression ではない)
  callExternalClassMethod(): boolean {
    const result = ok(1);
    return result.isOk();
  }

  callInternalNew(): Helper {
    return new Helper();
  }

  // レビュー再指摘3: 明示 constructor を持つ internal class への new X() のリグレッションガード
  callInternalNewWithConstructor(): HelperWithCtor {
    return new HelperWithCtor('x');
  }

  callChain(): string {
    return this.helper.ping().toUpperCase().trim();
  }

  callUnresolvedParameterCallback(next: () => void): void {
    next();
  }

  callUnresolvedStoredReference(): void {
    const unsub = this.helper.subscribe();
    unsub();
  }

  // team-lead 決定(Task 10 remaining-diff cause 6): for-of の反復変数(呼び出し可能な型の
  // 配列プロパティを反復する束縛)も 'stored-function-reference' に分類されるべき
  // (ec-backend の OrderHandlers.shutdown の実例: `for (const unsub of this.unsubscribes)
  // unsub()`)。この束縛は initializer を持たない(値は反復元から来るため)ため、
  // 「initializer が CallExpression」という既存条件だけでは検出できなかった
  callUnresolvedStoredReferenceViaForOf(): void {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
  }

  callUnresolvedDynamicProperty(key: string): void {
    const obj: Record<string, () => void> = { a: () => undefined };
    obj[key]?.();
  }

  // レビュー指摘14: `getResolvedSignature` が実際の宣言に辿り着かない catch-all
  // (symbol-unresolved)を再現する。`raw` は `unknown` として保持した後に関数型へ
  // as で戻しているため、呼び出し式の callee(ParenthesizedExpression 越しの AsExpression)は
  // identifier/property/element のいずれの名前ノードにも該当しない。この場合
  // `checker.getResolvedSignature` は解決するが、その `.declaration` は名前を持つ
  // 宣言ではなく匿名の FunctionType ノードになり、`functionRefOfDeclaration` が
  // internal ref を作れない(TypeScript の実際の挙動で検証済み)
  callUnresolvedSymbol(): void {
    const raw: unknown = this.helper.ping;
    (raw as () => string)();
  }

  // 未決事項メモの訂正(TypeScript の実際の挙動で検証済み): 単純なメソッド参照の代入
  // (`.bind()` を挟まない)は初期化子が CallExpression ではないため
  // bareIdentifierSpecialCase に一致せず、checker.getResolvedSignature が元のメソッド宣言
  // まで解決するため internal として正しく解決される(unresolvedCalls には落ちない)
  callMethodReference(): string {
    const fn = this.helper.ping;
    return fn();
  }

  callWithFirstArgLiteral(): void {
    bareModuleCallee();
    this.emitLike('order:created');
  }

  emitLike(_event: string): void {
    // no-op(emit 相当のシグネチャを模した内部メソッド。firstArgLiteral 検証専用)
  }

  callImportedBareFunction(): string {
    return importedHelper();
  }

  // Task 5 追加(レビュー指摘2): バレル経由の再エクスポート越しの裸呼び出しも internal に解決される
  callViaBarrel(): string {
    return viaBarrel();
  }

  // Task 5 追加(レビュー指摘2): タグ付きテンプレート式の呼び出し解決
  callTaggedTemplate(): string {
    return tag`value: ${1}`;
  }

  // Task 5 追加(レビュー指摘2): foo().bar(baz()) は foo()/baz() のみ記録され、
  // チェーン中間の bar() は isChainContinuation により記録されない
  callChainArgument(): string {
    return foo().bar(baz());
  }

  // レビュー指摘15: default-lib 除外専用の独立したフィクスチャ。3つとも
  // lib.es5.d.ts 内で宣言されており(TypeScript の実際の挙動で検証済み)、
  // isDefaultLib(program.isSourceFileDefaultLibrary)により丸ごと除外される
  callDefaultLibOnly(): void {
    Math.max(1, 2);
    parseInt('3', 10);
    [1, 2].map((n) => n * 2);
  }

  // team-lead 決定(Task 10 remaining-diff cause 2): パラメータの default 値の中の呼び出しは
  // body の外にあるため、body だけを走査する経路では発見されなかった(ec-backend の
  // `async register(req = request(RegisterSchema))` の実例)。default 値の中の呼び出し自体は
  // 関数の try/catch/branch/loop/callback のいずれの内側でもない(呼び出し側がメソッド呼び出し
  // 時に評価する)ため 'plain' になる
  callWithDefaultParameterValue(value = requireUser()): string {
    return value;
  }

  // team-lead 決定(Task 10 remaining-diff cause 4): 複数行にまたがるメソッドチェーンの
  // 呼び出し1件目(`this.helper` がレシーバで、それ自体は CallExpression ではないため
  // isChainContinuation に該当しない)の line は、レシーバ式の先頭行(`this.helper` のある行)
  // ではなく、実際に呼び出されるメンバー名 `.ping` 自身の行になるべき(ec-backend の
  // `this.drizzle.db.select()` の実例)
  // biome-ignore format: このメソッドチェーンは複数行のまま保持する必要がある(biome は短いチェーンを1行に畳むため)
  callMultilineChain(): string {
    return this.helper
      .ping();
  }

  // レビュー指摘4: ネストした(トップレベルでない)`function local() {}` への呼び出しは
  // collectFunctionDeclarations(SSOT)が列挙しない宣言を指す ref を作ってしまい、
  // 呼び出し先で DECLARATION_NOT_FOUND になっていた。local() 自体への呼び出しは記録せず、
  // local の本体内の呼び出し(requireUser())は既存どおり囲む callWithNestedFunctionDeclaration の
  // CallSite 列挙に含まれることを確認する
  callWithNestedFunctionDeclaration(): void {
    function local(): void {
      requireUser();
    }
    local();
  }
}
