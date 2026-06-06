# @zeltjs/unsafe-type-lib

TypeScript の言語機能では型安全性を維持できない箇所に対して、最小限の unsafe キャストを提供するライブラリ。

## 思想

このパッケージは **「型安全だとわかっているのに、言語機能が足りなくて安全にできない」** 場合に使うものです。

典型例:

- `Object.entries()` / `Object.fromEntries()` すると型が消える
- `JSON.parse()` の戻り値が `unknown` になる
- DI コンテナが返す値の型パラメータが消える

**このパッケージは「unsafe なもの全部入れ」ではありません。** ランタイムで正しいことが保証されているにもかかわらず、TypeScript の型システムがそれを表現できないケースだけを対象にしています。

## `as` の分類

TypeScript における `as` の用途は大きく5つに分類できる。

### 1. 何の保証もない `as`

型が合わないのでとりあえず黙らせるキャスト。最も危険。

```ts
const value = someFunction() as MyType; // 根拠なし
```

### 2. 信頼境界の `as`

外部入力（API レスポンス、JSON など）にバリデーション付きで型を与えるキャスト。
バリデーションの正しさに依存する。

```ts
const parsed = schema.parse(JSON.parse(raw)) as Config;
```

### 3. 言語機能不足を補う `as`

ランタイムでは正しいことが保証されているが、TypeScript の型システムが表現できないキャスト。
**このパッケージが対象とするスコープ。**

いくつかの小分類がある:

#### 3a. 型推論の限界

ジェネリクスや高階型の推論が追いつかないケース。

```ts
// Object.entries() はキーを string に拡げてしまう
const entries = Object.entries(record) as [keyof T, T[keyof T]][];
```

#### 3b. ナローイング補助

型ガードや discriminated union で絞り込んだ後、コンパイラが推論しきれないケース。

```ts
// switch で全ケースを網羅しているが、コンパイラが絞りきれない末端
function handle(action: Action) {
  switch (action.type) {
    case "create":
      return processCreate(action as CreateAction);
    // ...
  }
}
```

> **推奨:** このケースは `ts-pattern` の `match().exhaustive()` を使えば `as` なしで型安全にナローイングできる。標準の `switch` 構文の制約であり、言語機能自体の不足ではないため、`as` ではなく `ts-pattern` の利用を推奨する。

### 4. テストモックの `as`

テストでオブジェクトの一部だけ用意するためのキャスト。プロダクションコードには入らない。

```ts
const mockUser = { name: "test" } as User;
```

### 5. ライブラリ型定義の不備を回避する `as`

サードパーティの `@types` が不正確・古い場合に正しい型へ矯正するキャスト。
外部要因に依存するため、型定義の更新で不要になることがある。

```ts
// @types/xxx が返り値を string としているが、実際は string | null
const result = lib.getValue() as string | null;
```

---

**このパッケージは分類 3（言語機能不足を補う `as`）のみを対象とする。** それ以外の `as` は、それぞれ適切な場所（バリデーション層、テストユーティリティなど）で管理すべきである。

## 採用基準

以下の **すべて** を満たす場合のみ、このパッケージにユーティリティを追加します:

1. ランタイムでの正しさが構造的に保証されている
2. TypeScript の型システムだけでは型安全性を表現できない
3. `as` キャストを呼び出し側に散らばらせると、型安全性の責任が曖昧になる

## モジュール

| モジュール | 解決する問題 |
|---|---|
| `keyed-values` | `Object.entries()` / `Object.fromEntries()` でキーと値の型の対応が消える |
| `deferred-value` | 遅延解決される値をハンドル経由で型安全に取り出す |
| `json` | `JSON.parse()` の戻り値が `unknown` になる |
| `callable` | unknown な値を型付き callable として扱う |
| `class-constructor` | 値がクラスコンストラクタかどうかのランタイム型ガード |
| `injection-token-weak-map` | DI トークンの型パラメータが WeakMap 経由で消える |
