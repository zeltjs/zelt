# @zeltjs/unsafe-type-lib

TypeScript の言語機能では型安全性を維持できない箇所に対して、最小限の unsafe キャストを提供するライブラリ。

## 思想

このパッケージは **「型安全だとわかっているのに、言語機能が足りなくて安全にできない」** 場合に使うものです。

典型例:

- `Object.entries()` / `Object.fromEntries()` すると型が消える
- `JSON.parse()` の戻り値が `unknown` になる
- DI コンテナが返す値の型パラメータが消える

**このパッケージは「unsafe なもの全部入れ」ではありません。** ランタイムで正しいことが保証されているにもかかわらず、TypeScript の型システムがそれを表現できないケースだけを対象にしています。

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
