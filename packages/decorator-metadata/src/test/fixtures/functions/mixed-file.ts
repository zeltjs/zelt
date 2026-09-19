// getFunctionDeclarations テスト用。クラスメソッド(public/private/static/get/set)と
// コンストラクタを混在させ、コンストラクタが対象外になることを確認する
import { ExternalDep as AliasedDep } from './dep-external';

// 素朴な native ECMAScript decorator(何もしない)。名前・行・識別子引数の抽出を確認する
function LogCall(_target: unknown, _context: ClassMethodDecoratorContext): void {}

class Dep {}

function Wired(_dep: unknown): (_target: unknown, _context: ClassMethodDecoratorContext) => void {
  return () => {};
}

export class Widget {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: set config からのみ書き込まれる、意図的な write-only private field(private/get/set 抽出テスト用)
  private mutableName = '';

  constructor(private readonly name: string) {}

  @LogCall
  render(): string {
    return this.name;
  }

  @Wired(Dep)
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: 呼び出されない private メソッドへの decorator 適用を検出できることを確認するためのフィクスチャ
  private guarded(): void {
    this.render();
  }

  // import 別名(AliasedDep)経由で渡された decorator 引数。ClassSource は import 元の
  // 実際の宣言(dep-external.ts の ExternalDep)を指すべきで、ローカルの別名テキストでは
  // ないことを確認する(レビュー指摘8)
  @Wired(AliasedDep)
  aliasedDecoratorArg(): void {
    // no-op
  }

  static create(name: string): Widget {
    return new Widget(name);
  }

  get label(): string {
    return this.name;
  }

  // get と別名の set accessor(同名 get/set 共存は未検証のため name を分ける。設計判断メモ12)
  set config(value: string) {
    this.mutableName = value;
  }

  greet(target: string): string;
  greet(target: number): string;
  greet(target: string | number): string {
    return `hi ${target}`;
  }
}
